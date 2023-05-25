import { RejectPendingRequestAction, ResolvePendingRequestAction } from "./action";
import { isValidReturn } from "./payload-validation";
import { AskForBid, BidType, CurrentBidsForEvent, Placed, RequestBid, isSameBid } from "./bid";


export type InvalidBidReasons = {
    eventId: string;
    bidType?: BidType,
    flowId?: string,
    bidId?: number,
    reasons: {
        type: string;
        blockedBy?: {flowId: string, bidId: number}
        expectedBid?: {flowId: string, bidId: number},
    }[]
}


/**
 * will return the invalid reasons for the given askFor bid. If no askFor bid is provided, the highest priority askFor bid will be used.
 * if the current bids  provided, this function will check and return all invalid reasons for the askFor bid.
 * @remarks this function will not check if the askFor payload is valid or not.
 * @param currentBids current placed bids for this event
 * @param askForBid the askFor bid that will be checked (will default to the highest priority askFor bid if not provided)
 * @returns all invalid reasons for the askFor bid or undefined if the askFor bid is valid
 */
export function invalidReasonsForAskForBid<P,V>(eventId: string, currentBids?: CurrentBidsForEvent<P, V>, askForBid?: Placed<AskForBid<P,V>>): InvalidBidReasons | undefined {
    const invalidReasons: InvalidBidReasons = {eventId, reasons: [], bidType: askForBid ? BidType.askFor : undefined, flowId: askForBid?.flow.id, bidId: askForBid?.id};
    // 1. check if the event information is available (if any bid is placed for this event id)
    if(currentBids === undefined) {
        invalidReasons.reasons.push({type: 'no current bids for this event'});
        return invalidReasons;
    }
    // 2. check if the bid is blocked
    currentBids.block?.forEach(block => {
        if(block.validate === undefined || (block.validate && isValidReturn(block.validate()))) {
            invalidReasons.reasons.push({type: 'blocked', blockedBy: {flowId: block.flow.id, bidId: block.id}});
        }
    });
    // 3. check if the bid has a pending request
    if(currentBids.pendingRequest) {
        invalidReasons.reasons.push({type: 'event is pending'});
    }
    // 4. check if the there is an askFor bid
    const highestPriorityAskForBid = currentBids.askFor?.[0];
    if(highestPriorityAskForBid === undefined) {
       invalidReasons.reasons.push({type: 'no askFor bid'});
       return invalidReasons;
    }
    // 5. check if the askFor bid is from a different scheduler than the event
    if(highestPriorityAskForBid.flow.pathFromRootFlow[0] !== currentBids.event.rootFlowId) {
        invalidReasons.reasons.push({type: 'events connected to a different scheduler can not be requested'});
    }
    // if no askFor bid was provided, set the askFor bid to the highest priority askFor bid
    if(askForBid === undefined) {
        // if no action was provided, set the action target to the highest priority askFor bid
        askForBid = highestPriorityAskForBid;
    }
    // 6. if an askFor bid was provided, check if the askFor bid is the highest priority askFor bid (in a replay)
    else if(!isSameBid(highestPriorityAskForBid, askForBid.flow.id, askForBid.id)) {
        invalidReasons.reasons.push({type: 'the provided bid is not the highest priority askFor bid', expectedBid: {flowId: highestPriorityAskForBid.flow.id, bidId: highestPriorityAskForBid.id}});
    }
    // 7. check if the bid has a pending extend, if so, check if the bid will resolve the extend
    if(currentBids.pendingExtend) {
        const isResolveExtendBid = currentBids.pendingExtend.extendingFlow.id === askForBid.flow.id;
        if(!isResolveExtendBid) {
            invalidReasons.reasons.push({type: 'event is extended by another flow'});
        }
    }
    return invalidReasons.reasons.length > 0 ? invalidReasons : undefined;
}


/**
 * for a given request bid, this function will return all invalid reasons for the bid.
 * if the current bids are provided, this function will check and return all invalid reasons for the request bid.
 * @remarks this function will not check if the request payload is valid or not.
 * @param bid the request bid that will be checked
 * @param currentBids current placed bids for this event
 * @returns all invalid reasons for the request bid or undefined if the request bid is valid.
 */
export function invalidReasonsForRequestBid(bid: Placed<RequestBid<any, any>>, currentBids?: CurrentBidsForEvent<any, any>): InvalidBidReasons | undefined {
    const invalidReasons: InvalidBidReasons = {eventId: bid.event.id, reasons: [], bidType: BidType.request, flowId: bid.flow.id, bidId: bid.id};
    // 1. check if the event information is available (if any bid is placed for this event id)
    if(currentBids === undefined) {
        invalidReasons.reasons.push({type: 'no current bids for this event'});
        return invalidReasons;
    };
    // 2. check if the bid is blocked
    currentBids.block?.forEach(block => {
        if(block.validate === undefined || (block.validate && isValidReturn(block.validate()))) {
            invalidReasons.reasons.push({type: 'blocked', blockedBy: {flowId: block.flow.id, bidId: block.id}});
        }
    });
    // 3. if the bid is only valid when asked for, check if there is an askFor bid
    if(bid.isTriggerAskedFor) {
        if(currentBids.askFor?.length === 0) {
            invalidReasons.reasons.push({type: 'no askFor bid'});
        }
    }
    // 4. check if the bid has a pending request
    if(currentBids.pendingRequest) {
        if(currentBids.pendingRequest.flow.id === bid.flow.id && currentBids.pendingRequest.id === bid.id) {
            invalidReasons.reasons.push({type: 'pending and waiting for resolve/reject'});
        } else {
            invalidReasons.reasons.push({type: 'another flow is currently pending this event'});
        }
    }
    // 5. check if the bid has a pending extend
    else if(currentBids.pendingExtend) {
        const willResolveTheExtendBid = bid.flow.id === currentBids.pendingExtend.extendingFlow.id;
        if(!willResolveTheExtendBid) {
            invalidReasons.reasons.push({type: 'event is extended by another flow'});
        }
    }
    // 6. if the bid is from a different scheduler than the event, check if the bid is a triggerAskedFor bid
    else if(bid.flow.pathFromRootFlow[0] !== bid.event.rootFlowId) {
        if(!bid.isTriggerAskedFor) {
            invalidReasons.reasons.push({type: 'events connected to a different scheduler can not be requested'});
        }
    }
    return invalidReasons.reasons.length === 0 ? undefined : invalidReasons;
}


/**
 * check if for the given resolvePendingRequest or rejectPendingRequest action, a matching pending request bid exists.
 * @param action  the resolvePendingRequest or rejectPendingRequest action that will be checked
 * @param pendingRequest the pending request bid that will be checked
 * @returns all invalid reasons for the resolvePendingRequest or rejectPendingRequest action or undefined if the action is valid
 */
export function invalidReasonsForPendingRequestBid(action: ResolvePendingRequestAction<any> | RejectPendingRequestAction, pendingRequest?: Placed<RequestBid<any, any>>): InvalidBidReasons | undefined {
    const invalidReasons: InvalidBidReasons = {eventId: action.eventId, reasons: [], bidType: BidType.request, flowId: action.flowId, bidId: action.bidId};
    // 1. check if the pending request is available for this event
    if(pendingRequest === undefined) {
        invalidReasons.reasons.push({type: 'no pending request'});
        return invalidReasons;
    }
    // 2. check if the flow id matches
    if(pendingRequest.flow.id !== action.flowId) {
        invalidReasons.reasons.push({type: 'flow id does not match', expectedBid: {flowId: pendingRequest.flow.id, bidId: pendingRequest.id}});
    }
    // 3. check if the bid id matches
    if(pendingRequest.id !== action.bidId) {
        invalidReasons.reasons.push({type: 'bid id does not match', expectedBid: {flowId: pendingRequest.flow.id, bidId: pendingRequest.id}});
    }
    return invalidReasons.reasons.length === 0 ? undefined : invalidReasons;
}