import { RejectPendingRequestAction, ResolvePendingRequestAction } from "./action";
import { isValidReturn } from "./payload-validation";
import { EventInformation, PlacedBid, PlacedRequestBid, PlacedWaitingBid, WaitingBid, isSameBid } from "./bid";


export type InvalidBidReason = {
    flowId?: string;
    bidId?: number;
    reason: 'no event information' | 'blocked' | 'no askFor bid' | 'event is pending' | 'pending and waiting for resolve/reject' | 'another flow is currently pending this event' | 'event is extended by another flow' | 'no pending request' | 'flow id does not match' | 'bid id does not match' | 'the provided bid is not the highest priority askFor bid';
}

/**
 * will return the invalid reasons for the given askFor bid. If no askFor bid is provided, the highest priority askFor bid will be used.
 * if the event info is provided, this function will check and return all invalid reasons for the askFor bid.
 * @remarks this function will not check if the askFor payload is valid or not.
 * @param eventInfo event information of the event
 * @param askForBid the askFor bid that will be checked (will default to the highest priority askFor bid if not provided)
 * @returns all invalid reasons for the askFor bid or undefined if the askFor bid is valid
 */
export function invalidReasonsForAskForBid<P,V>(eventInfo?: EventInformation<P, V>, askForBid?: PlacedWaitingBid<P,V>): InvalidBidReason[] | undefined {
    const invalidReasons: InvalidBidReason[] = [];
    // 1. check if the event information is available (if any bid is placed for this event id)
    if(eventInfo === undefined) {
        return [{reason: 'no event information'}];
    }
    // 2. check if the bid is blocked
    eventInfo.block.forEach(block => {
        if(block.validate === undefined || (block.validate && isValidReturn(block.validate()))) {
            invalidReasons.push({flowId: block.flow.id, bidId: block.id, reason: 'blocked'});
        }
    });
    // 3. check if the there is an askFor bid
    const highestPriorityAskForBid = eventInfo.askFor[0];
    if(highestPriorityAskForBid === undefined) {
       invalidReasons.push({reason: 'no askFor bid'});
    }
    // if no askFor bid was provided, set the askFor bid to the highest priority askFor bid
    if(askForBid === undefined) {
        // if no action was provided, set the action target to the highest priority askFor bid
        askForBid = highestPriorityAskForBid;
    }
    // 4. if an askFor bid was provided, check if the askFor bid is the highest priority askFor bid
    else if(!isSameBid(highestPriorityAskForBid, askForBid.flow.id, askForBid.id)) {
        invalidReasons.push({reason: 'the provided bid is not the highest priority askFor bid'});
    }
    // 5. check if the bid has a pending request
    if(eventInfo.pendingRequest) {
        invalidReasons.push({reason: 'event is pending'});
    }
    // 6. check if the bid has a pending extend, if so, check if the bid will resolve the extend
    if(eventInfo.pendingExtend) {
        const isResolveExtendBid = eventInfo.pendingExtend.extendingFlow.id === askForBid.flow.id;
        if(!isResolveExtendBid) {
            invalidReasons.push({reason: 'event is extended by another flow'});
        }
    }
    return invalidReasons.length > 0 ? invalidReasons : undefined;
}

/**
 * for a given request bid, this function will return all invalid reasons for the bid.
 * if the event info is provided, this function will check and return all invalid reasons for the request bid.
 * @remarks this function will not check if the request payload is valid or not.
 * @param bid the request bid that will be checked
 * @param eventInfo event information of the event
 * @returns all invalid reasons for the request bid or undefined if the request bid is valid.
 */
export function invalidReasonsForRequestBid(bid: PlacedRequestBid<any, any>, eventInfo?: EventInformation<any, any>, ): InvalidBidReason[] | undefined {
    const invalidReasons: InvalidBidReason[] = [];
    // 1. check if the event information is available (if any bid is placed for this event id)
    if(eventInfo === undefined) {
        return [{reason: 'no event information'}];
    };
    // 2. check if the bid is blocked
    eventInfo.block.forEach(block => {
        if(block.validate === undefined || (block.validate && isValidReturn(block.validate()))) {
            invalidReasons.push({flowId: block.flow.id, bidId: block.id, reason: 'blocked'});
        }
    });
    // 3. if the bid is only valid when asked for, check if there is an askFor bid
    if(bid.onlyWhenAskedFor) {
        if(eventInfo.askFor.length === 0) {
            invalidReasons.push({reason: 'no askFor bid'});
        }
    }
    // 4. check if the bid has a pending request
    if(eventInfo.pendingRequest) {
        if(eventInfo.pendingRequest.flow.id === bid.flow.id && eventInfo.pendingRequest.id === bid.id) {
            invalidReasons.push({reason: 'pending and waiting for resolve/reject'});
        } else {
            invalidReasons.push({reason: 'another flow is currently pending this event'});
        }
    }
    // 5. check if the bid has a pending extend
    else if(eventInfo.pendingExtend) {
        const willResolveTheExtendBid = bid.flow.id === eventInfo.pendingExtend.extendingFlow.id;
        if(!willResolveTheExtendBid) {
            invalidReasons.push({reason: 'event is extended by another flow'});
        }
    }
    return invalidReasons.length === undefined ? undefined : invalidReasons;
}

/**
 * check if for the given resolvePendingRequest or rejectPendingRequest action, a matching pending request bid exists.
 * @param action  the resolvePendingRequest or rejectPendingRequest action that will be checked
 * @param pendingRequest the pending request bid that will be checked
 * @returns all invalid reasons for the resolvePendingRequest or rejectPendingRequest action or undefined if the action is valid
 */
export function invalidReasonsForPendingRequestBid(action: ResolvePendingRequestAction<any> | RejectPendingRequestAction, pendingRequest?: PlacedRequestBid<any, any>): InvalidBidReason[] | undefined {
    const invalidReasons: InvalidBidReason[] = [];
    // 1. check if the pending request is available for this event
    if(pendingRequest === undefined) {
        return[{reason: 'no pending request'}];
    }
    // 2. check if the flow id matches
    if(pendingRequest.flow.id !== action.flowId) {
        invalidReasons.push({reason: 'flow id does not match'});
    }
    // 3. check if the bid id matches
    if(pendingRequest.id !== action.bidId) {
        invalidReasons.push({reason: 'bid id does not match'});
    }
    return invalidReasons.length === 0 ? undefined : invalidReasons;

}