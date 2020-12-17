import { BidsByType, isBlocked, BidType, hasValidMatch, getMatchingBids } from './bid';
import { Action } from './action';
import { BThreadMap } from './bthread-map';
import { BThread } from './bthread';
import { isValid } from './validation';


export enum ActionCheck {
    OK = 'OK',
    IsBlocked = 'IsBlocked',
    IsInvalidPayload = 'IsInvalidPayload',
    NotAskedFor = 'NotAskedFor',
    MissingBidType = 'MissingBidType',
    RequestingBThreadNotFound = 'RequestingBThreadNotFound',
    BThreadWithoutMatchingBid = 'BThreadWithoutMatchingBid',
    unableToTrigger = 'unableToTrigger',
    ResolvingBThreadNotFound = 'ResolvingBThreadNotFound',
    EventWasCancelled = 'EventWasCancelled',
    RejectBThreadNotFound = 'RejectBThreadNotFound'
}


export function checkRequestAction(bThreadMap: BThreadMap<BThread>, bidsByType: BidsByType, action: Action): ActionCheck {
    if(isBlocked(bidsByType, action.eventId, action)) return ActionCheck.IsBlocked;
    if(action.bidType === undefined) return ActionCheck.MissingBidType;
    const bThread = bThreadMap.get(action.bThreadId);
    if(bThread === undefined) return ActionCheck.RequestingBThreadNotFound;
    const bid = bThread.getCurrentBid(action);
    if(bid === undefined) return ActionCheck.BThreadWithoutMatchingBid;
    if(bid.type === BidType.trigger) {
        if(!hasValidMatch(bidsByType, BidType.askFor, bid.eventId, bid) && !hasValidMatch(bidsByType, BidType.waitFor, bid.eventId, bid)) return ActionCheck.unableToTrigger; 
    }
    return ActionCheck.OK;
}


export function checkUiAction(bidsByType: BidsByType, action: Action): ActionCheck {
    if(isBlocked(bidsByType, action.eventId, action)) return ActionCheck.IsBlocked;
    const matchingAskForBids = getMatchingBids(bidsByType, [BidType.askFor], action.eventId);
    if(matchingAskForBids === undefined) return ActionCheck.NotAskedFor;
    if(matchingAskForBids.every(bid => !isValid(bid, action.payload))) return ActionCheck.IsInvalidPayload;
    return ActionCheck.OK;
}


export function checkResolveAction(bThreadMap: BThreadMap<BThread>, action: Action): ActionCheck {
    if(action.bidType === undefined) return ActionCheck.MissingBidType;
    const bThread = bThreadMap.get(action.bThreadId);
    if(bThread === undefined) return ActionCheck.ResolvingBThreadNotFound;
    if(bThread.currentBids?.pending?.get(action.eventId) === undefined) return ActionCheck.EventWasCancelled;
    return ActionCheck.OK;
}


export function checkRejectAction(bThreadMap: BThreadMap<BThread>, action: Action): ActionCheck {
    const bThread = bThreadMap.get(action.bThreadId);
    if(bThread === undefined) return ActionCheck.RejectBThreadNotFound;
    return ActionCheck.OK;
}