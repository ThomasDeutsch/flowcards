import { BidsByType, isBlocked, BidType, hasValidMatch, getMatchingBids } from './bid';
import { RequestedAction, ResolveAction, UIAction } from './action';
import { BThreadMap } from './bthread-map';
import { BThread } from './bthread';
import { isValid } from './validation';
import { ResolveExtendAction } from '.';


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


export function checkRequestAction(bThreadMap: BThreadMap<BThread>, bidsByType: BidsByType, action: RequestedAction): ActionCheck {
    if(isBlocked(bidsByType, action.eventId, action)) return ActionCheck.WasBlocked;
    if(action.bidType === undefined) return ActionCheck.HasMissingBidType;
    const requestingBThread = bThreadMap.get(action.bThreadId);
    if(requestingBThread === undefined) return ActionCheck.BThreadNotFound;
    const requestedBid = requestingBThread.getCurrentBid(action.bidType, action.eventId);
    if(requestedBid === undefined) return ActionCheck.BThreadWithoutMatchingBid;
    if(requestedBid.type === BidType.trigger) {
        if(!hasValidMatch(bidsByType, BidType.askFor, requestedBid.eventId, requestedBid) && !hasValidMatch(bidsByType, BidType.waitFor, requestedBid.eventId, requestedBid)) return ActionCheck.WasNotAskedOrWaitedFor; 
    }
    return ActionCheck.OK;
}


export function checkUiAction(bidsByType: BidsByType, action: UIAction): ActionCheck {
    if(isBlocked(bidsByType, action.eventId, action)) return ActionCheck.WasBlocked;
    const matchingAskForBids = getMatchingBids(bidsByType, [BidType.askFor], action.eventId);
    if(matchingAskForBids === undefined) return ActionCheck.WasNotAskedFor;
    if(matchingAskForBids.every(bid => !isValid(bid, action.payload))) return ActionCheck.HasInvalidPayload;
    return ActionCheck.OK;
}


export function checkResolveAction(bThreadMap: BThreadMap<BThread>, action: ResolveAction): ActionCheck {
    //if(action.bidType === undefined) return ActionCheck.HasMissingBidType;
    const requestingBThread = bThreadMap.get(action.requestingBThreadId);
    if(requestingBThread === undefined) return ActionCheck.BThreadNotFound;
    if(requestingBThread.currentBids?.pending?.get(action.eventId) === undefined) return ActionCheck.EventWasCancelled;
    return ActionCheck.OK;
}


export function checkResolveExtendAction(bThreadMap: BThreadMap<BThread>, action: ResolveExtendAction): ActionCheck {
    if(action.extendedRequestingBid?.bThreadId === undefined) return ActionCheck.BThreadNotFound;
    const requestingBThread = bThreadMap.get(action.extendedRequestingBid.bThreadId);
    if(requestingBThread === undefined) return ActionCheck.BThreadNotFound;
    if(action.extendedRequestingBid === undefined) return ActionCheck.HasMissingBidType;
    if(requestingBThread.currentBids?.[action.extendedRequestingBid.type] === undefined) return ActionCheck.EventWasCancelled;
    return ActionCheck.OK;
}


export function checkRejectAction(bThreadMap: BThreadMap<BThread>, action: ResolveAction): ActionCheck {
    const requestingBThread = bThreadMap.get(action.requestingBThreadId);
    if(requestingBThread === undefined) return ActionCheck.BThreadNotFound;
    return ActionCheck.OK;
}