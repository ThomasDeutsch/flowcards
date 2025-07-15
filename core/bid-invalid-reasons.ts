import { RejectPendingRequestAction, ResolvePendingRequestAction } from "./action.ts";
import { WhenBid, BidType, CurrentBidsForEvent, Placed, SetBid, getHighestPriorityWhenBid } from "./bid.ts";
import { equalPaths } from "./utils.ts";


// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

export type InvalidBidReason = {
    eventId: string,
    type: string,
    bidType?: BidType,
    rulePath?: string[],
    bidId?: number,
}


// CORE FUNCTIONS -----------------------------------------------------------------------------------------------

export function getValidWhenBid<P,V>(eventId: string, currentBids?: CurrentBidsForEvent<P, V>): {whenBid?: Placed<WhenBid<P, V>>, invalidBidReason?: InvalidBidReason} {
    const invalidBidReason: InvalidBidReason = {eventId, bidType: BidType.when, type: 'no current bids for this event'};
    // check if the event information is available (if any bid is placed for this event id)
    if(currentBids === undefined) {
        return {invalidBidReason};
    }
    if(currentBids.event.id !== eventId) {
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
        invalidBidReason.rulePath = currentBids.pendingRequest.rule.path;
        invalidBidReason.bidId = currentBids.pendingRequest.id;
        return {invalidBidReason};
    }
    // check if the bid has a pending extend, if so, check if the bid will resolve the extend
    if(currentBids.pendingExtend?.extendingRule) {
        const isResolveExtendBid = highestPriorityAskForBid.rule.id === currentBids.pendingExtend.extendingRule.id;
        if(!isResolveExtendBid) {
            invalidBidReason.type = 'event is extended by another rule';
            invalidBidReason.rulePath = currentBids.pendingExtend.extendingRule.path;
            return {invalidBidReason};
        }
    }
    // check if the when bid is from a different engine than the event
    if(highestPriorityAskForBid.rule.pathFromRootRule[0] !== currentBids.event.rootRuleId) {
        invalidBidReason.type = 'events connected to a different engine can not be requested';
        invalidBidReason.rulePath = highestPriorityAskForBid.rule.path;
        invalidBidReason.bidId = highestPriorityAskForBid.id;
        return {invalidBidReason};
    }
    return {whenBid: highestPriorityAskForBid};
}

export function invalidReasonForRequestBid(bid: Placed<SetBid<any, any>>, currentBids?: CurrentBidsForEvent<any, any>): InvalidBidReason | undefined {
    const invalidReason: InvalidBidReason = {eventId: bid.event.id, bidType: BidType.set, rulePath: bid.rule.path, bidId: bid.id, type: 'no current bids for this event'};
    // check if the event information is available (if any bid is placed for this event id)
    if(currentBids === undefined) {
        return invalidReason;
    };
    // check, when the bid is only valid when asked for, if there is an when-bid for it
    if(bid.isTrigger) {
        if(getHighestPriorityWhenBid(currentBids) === undefined) {
            invalidReason.type = 'no when-bid';
            return invalidReason;
        }
    }
    // check if the bid has a pending request
    if(currentBids.pendingRequest) {
        if(currentBids.pendingRequest.rule.id === bid.rule.id && currentBids.pendingRequest.id === bid.id) {
            invalidReason.type = 'pending and waiting for resolve/reject';
        } else {
            invalidReason.type = 'another rule is currently pending this event';
        }
        return invalidReason;
    }
    // check if the bid has a pending extend
    else if(currentBids.pendingExtend?.extendingRule) {
        const willResolveTheExtendBid = bid.rule.id === currentBids.pendingExtend.extendingRule.id;
        if(!willResolveTheExtendBid) {
            invalidReason.type = 'event is extended by another rule';
            return invalidReason;
        }
    }
    // if the bid is from a different engine than the event, check if the bid is a triggerAskedFor bid
    else if(bid.rule.pathFromRootRule[0] !== bid.event.rootRuleId) {
        if(!bid.isTrigger) {
            invalidReason.type = 'events connected to a different engine can not be requested';
            return invalidReason;
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
    const invalidReason: InvalidBidReason = {eventId: action.eventId, bidType: BidType.set, rulePath: action.rulePath, bidId: action.bidId, type: 'no pending request'};
    // check if the pending request is available for this event
    if(pendingRequest === undefined) {
        return invalidReason;
    }
    // check if the rule path matches
    if(!equalPaths(pendingRequest.rule.path, action.rulePath)) {
        invalidReason.type = 'rule path does not match';
        return invalidReason;
    }
    // check if the bid id matches
    if(pendingRequest.id !== action.bidId) {
        invalidReason.type = 'bid id does not match';
        return invalidReason;
    }
    return undefined
}

