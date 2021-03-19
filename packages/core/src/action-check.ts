import { BidsByType, isBlocked, BidType, hasValidMatch, getMatchingBids } from './bid';
import { Action } from './action';
import { BThreadMap } from './bthread-map';
import { BThread } from './bthread';
import { isValid } from './validation';


export enum ActionCheck {
    OK = 'OK',
    WasBlocked = 'WasBlocked',
    HasInvalidPayload = 'HasInvalidPayload',
    WasNotAskedFor = 'WasNotAskedFor',
    HasMissingBidType = 'HasMissingBidType',
    BThreadNotFound = 'BThreadNotFound',
    BThreadWithoutMatchingBid = 'BThreadWithoutMatchingBid',
    WasNotAskedOrWaitedFor = 'WasNotAskedOrWaitedFor',
    EventWasCancelled = 'EventWasCancelled'
}


export function checkRequestAction(bThreadMap: BThreadMap<BThread>, bidsByType: BidsByType, action: Action): ActionCheck {
    if(isBlocked(bidsByType, action.eventId, action)) return ActionCheck.WasBlocked;
    if(action.bidType === undefined) return ActionCheck.HasMissingBidType;
    const bThread = bThreadMap.get(action.bThreadId);
    if(bThread === undefined) return ActionCheck.BThreadNotFound;
    const bid = bThread.getCurrentBid(action);
    if(bid === undefined) return ActionCheck.BThreadWithoutMatchingBid;
    if(bid.type === BidType.trigger) {
        if(!hasValidMatch(bidsByType, BidType.askFor, bid.eventId, bid) && !hasValidMatch(bidsByType, BidType.waitFor, bid.eventId, bid)) return ActionCheck.WasNotAskedOrWaitedFor; 
    }
    return ActionCheck.OK;
}


export function checkUiAction(bidsByType: BidsByType, action: Action): ActionCheck {
    if(isBlocked(bidsByType, action.eventId, action)) return ActionCheck.WasBlocked;
    const matchingAskForBids = getMatchingBids(bidsByType, [BidType.askFor], action.eventId);
    if(matchingAskForBids === undefined) return ActionCheck.WasNotAskedFor;
    if(matchingAskForBids.every(bid => !isValid(bid, action.payload))) return ActionCheck.HasInvalidPayload;
    return ActionCheck.OK;
}


export function checkResolveAction(bThreadMap: BThreadMap<BThread>, action: Action): ActionCheck {
    if(action.bidType === undefined) return ActionCheck.HasMissingBidType;
    const bThread = bThreadMap.get(action.bThreadId);
    if(bThread === undefined) return ActionCheck.BThreadNotFound;
    if(bThread.currentBids?.pending?.get(action.eventId) === undefined) return ActionCheck.EventWasCancelled;
    return ActionCheck.OK;
}


export function checkRejectAction(bThreadMap: BThreadMap<BThread>, action: Action): ActionCheck {
    const bThread = bThreadMap.get(action.bThreadId);
    if(bThread === undefined) return ActionCheck.BThreadNotFound;
    return ActionCheck.OK;
}