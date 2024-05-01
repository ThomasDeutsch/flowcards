import { RejectPendingRequestAction, ResolvePendingRequestAction } from "./action.ts";
import { WhenBid, BidType, CurrentBidsForEvent, Placed, SetBid, getHighestPriorityWhenBid } from "./bid.ts";
import { equalPaths } from "./utils.ts";


export type InvalidBidReason = {
    eventId: string,
    type: string,
    bidType?: BidType,
    flowPath?: string[],
    bidId?: number,
}

/**
 * will return the invalid reasons for the current when-bid. If no when-bid is provided, the highest priority when-bid will be used.
 * if the current bids  provided, this function will check and return the first invalid reason for the when-bid.
 * @remarks this function will not check if the when-payload is valid or not.
 * @param currentBids current placed bids for this event
 * @param whenBid the when bid that will be checked (will default to the highest priority when bid if not provided)
 * @returns all invalid reasons for the when bid or undefined if the when bid is valid
 */
export function getValidAskForBid<P,V>(eventId: string, currentBids?: CurrentBidsForEvent<P, V>): {whenBid?: Placed<WhenBid<P, V>>, invalidBidReason?: InvalidBidReason} {
    const invalidBidReason: InvalidBidReason = {eventId, bidType: BidType.when, type: 'no current bids for this event'};
    // check if the event information is available (if any bid is placed for this event id)
    if(currentBids === undefined) {
        return {invalidBidReason};
    }
    // check if the there is an when bid
    const highestPriorityAskForBid = getHighestPriorityWhenBid(currentBids);
    if(highestPriorityAskForBid === undefined) {
        invalidBidReason.type = 'no when bid';
        return {invalidBidReason};
    }
    // check if the bid has a pending request
    if(currentBids.pendingRequest) {
        invalidBidReason.type = 'event is pending';
        invalidBidReason.flowPath = currentBids.pendingRequest.flow.path;
        invalidBidReason.bidId = currentBids.pendingRequest.id;
        return {invalidBidReason};
    }
    // check if the bid has a pending extend, if so, check if the bid will resolve the extend
    if(currentBids.pendingExtend?.extendingFlow) {
        const isResolveExtendBid = highestPriorityAskForBid.flow.id === currentBids.pendingExtend.extendingFlow.id;
        if(!isResolveExtendBid) {
            invalidBidReason.type = 'event is extended by another flow';
            invalidBidReason.flowPath = currentBids.pendingExtend.extendingFlow.path;
            return {invalidBidReason};
        }
    }
    // check if the when bid is from a different engine than the event
    if(highestPriorityAskForBid.flow.pathFromRootFlow[0] !== currentBids.event.rootFlowId) {
        invalidBidReason.type = 'events connected to a different engine can not be requested';
        invalidBidReason.flowPath = highestPriorityAskForBid.flow.path;
        invalidBidReason.bidId = highestPriorityAskForBid.id;
        return {invalidBidReason};
    }
    return {whenBid: highestPriorityAskForBid};
}


/**
 * for a given request bid, this function will return an invalid reasons for the bid (if any).
 * if the current bids are provided, this function will check all invalid reasons for the request bid.
 * @remarks this function will not check if the request payload is valid or not.
 * @param bid the request bid that will be checked
 * @param currentBids current placed bids for this event
 * @returns an invalid reason for the request bid or undefined if the request bid is valid.
 */
export function invalidReasonForRequestBid(bid: Placed<SetBid<any, any>>, currentBids?: CurrentBidsForEvent<any, any>): InvalidBidReason | undefined {
    const invalidReason: InvalidBidReason = {eventId: bid.event.id, bidType: BidType.set, flowPath: bid.flow.path, bidId: bid.id, type: 'no current bids for this event'};
    // check if the event information is available (if any bid is placed for this event id)
    if(currentBids === undefined) {
        return invalidReason;
    };
    // check, when the bid is only valid when asked for, if there is an when-bid for it
    if(bid.isTriggerAskedFor) {
        if(getHighestPriorityWhenBid(currentBids) === undefined) {
            invalidReason.type = 'no when-bid';
            return invalidReason;
        }
    }
    // check if the bid has a pending request
    if(currentBids.pendingRequest) {
        if(currentBids.pendingRequest.flow.id === bid.flow.id && currentBids.pendingRequest.id === bid.id) {
            invalidReason.type = 'pending and waiting for resolve/reject';
        } else {
            invalidReason.type = 'another flow is currently pending this event';
        }
        return invalidReason;
    }
    // check if the bid has a pending extend
    else if(currentBids.pendingExtend?.extendingFlow) {
        const willResolveTheExtendBid = bid.flow.id === currentBids.pendingExtend.extendingFlow.id;
        if(!willResolveTheExtendBid) {
            invalidReason.type = 'event is extended by another flow';
        }
    }
    // if the bid is from a different engine than the event, check if the bid is a triggerAskedFor bid
    else if(bid.flow.pathFromRootFlow[0] !== bid.event.rootFlowId) {
        if(!bid.isTriggerAskedFor) {
            invalidReason.type = 'events connected to a different engine can not be requested';
        }
    }
    return undefined;
}


/**
 * check if for the given resolvePendingRequest or rejectPendingRequest action, a matching pending request bid exists.
 * @param action  the resolvePendingRequest or rejectPendingRequest action that will be checked
 * @param pendingRequest the pending request bid that will be checked
 * @returns all invalid reasons for the resolvePendingRequest or rejectPendingRequest action or undefined if the action is valid
 */
export function invalidReasonForPendingRequestBid(action: ResolvePendingRequestAction<any> | RejectPendingRequestAction, pendingRequest?: Placed<SetBid<any, any>>): InvalidBidReason | undefined {
    const invalidReason: InvalidBidReason = {eventId: action.eventId, bidType: BidType.set, flowPath: action.flowPath, bidId: action.bidId, type: 'no pending request'};
    // check if the pending request is available for this event
    if(pendingRequest === undefined) {
        return invalidReason;
    }
    // check if the flow path matches
    if(!equalPaths(pendingRequest.flow.path, action.flowPath)) {
        invalidReason.type = 'flow path does not match';
        return invalidReason;
    }
    // check if the bid id matches
    if(pendingRequest.id !== action.bidId) {
        invalidReason.type = 'bid id does not match';
        return invalidReason;
    }
    return undefined
}

