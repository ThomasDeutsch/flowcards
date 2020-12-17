import { BidsByType, isBlocked, BidType, hasValidMatch, getMatchingBids } from './bid';
import { Action } from './action';
import { BThreadMap } from './bthread-map';
import { BThread } from './bthread';
import { isValid } from './validation';


export enum ActionTestResult {
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


export function checkRequestAction(bThreadMap: BThreadMap<BThread>, bidsByType: BidsByType, action: Action): ActionTestResult {
    if(isBlocked(bidsByType, action.eventId, action)) return ActionTestResult.IsBlocked;
    if(action.bidType === undefined) return ActionTestResult.MissingBidType;
    const bThread = bThreadMap.get(action.bThreadId);
    if(bThread === undefined) return ActionTestResult.RequestingBThreadNotFound;
    const bid = bThread.getCurrentBid(action);
    if(bid === undefined) return ActionTestResult.BThreadWithoutMatchingBid;
    if(bid.type === BidType.trigger) {
        if(!hasValidMatch(bidsByType, BidType.askFor, bid.eventId, bid) && !hasValidMatch(bidsByType, BidType.waitFor, bid.eventId, bid)) return ActionTestResult.unableToTrigger; 
    }
    return ActionTestResult.OK;
}


export function checkUiAction(bidsByType: BidsByType, action: Action): ActionTestResult {
    if(isBlocked(bidsByType, action.eventId, action)) return ActionTestResult.IsBlocked;
    const matchingAskForBids = getMatchingBids(bidsByType, [BidType.askFor], action.eventId);
    if(matchingAskForBids === undefined) return ActionTestResult.NotAskedFor;
    if(matchingAskForBids.every(bid => !isValid(bid, action.payload))) return ActionTestResult.IsInvalidPayload;
    return ActionTestResult.OK;
}


export function checkResolveAction(bThreadMap: BThreadMap<BThread>, action: Action): ActionTestResult {
    if(action.bidType === undefined) return ActionTestResult.MissingBidType;
    const bThread = bThreadMap.get(action.bThreadId);
    if(bThread === undefined) return ActionTestResult.ResolvingBThreadNotFound;
    if(bThread.currentBids?.pending?.get(action.eventId) === undefined) return ActionTestResult.EventWasCancelled;
    return ActionTestResult.OK;
}


export function checkRejectAction(bThreadMap: BThreadMap<BThread>, action: Action): ActionTestResult {
    const bThread = bThreadMap.get(action.bThreadId);
    if(bThread === undefined) return ActionTestResult.RejectBThreadNotFound;
    return ActionTestResult.OK;
}