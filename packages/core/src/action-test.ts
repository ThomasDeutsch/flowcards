import { BidsByType, isBlocked, BidType, hasValidMatch, Bid } from './bid';
import { ActionType, getMatchingBids } from './index';
import { BThreadMap } from './bthread-map';
import { BThread } from './bthread';
import { isValid } from './validation';
import { Action } from '../build/action';


export enum ActionTestResult {
    OK,
    IsBlocked,
    IsInvalidPayload,
    NotAskedFor,
    MissingBidType,
    RequestingBThreadNotFound,
    BThreadWithoutMatchingBid,
    unableToTrigger,
    ResolvingBThreadNotFound,
    EventWasCancelled,
    RejectBThreadNotFound
}

export function getBidsForAction(bThreadMap: BThreadMap<BThread>, bidsByType: BidsByType, action: Action): Bid[] | ActionTestResult {
    if(action.type === ActionType.request) { // when ok, will return the Bid of the requesting BThread
        if(isBlocked(bidsByType, action.eventId, action)) return ActionTestResult.IsBlocked;
        if(action.bidType === undefined) return ActionTestResult.MissingBidType;
        const bThread = bThreadMap.get(action.bThreadId);
        if(bThread === undefined) return ActionTestResult.RequestingBThreadNotFound;
        const bid = bThread.getCurrentBid(action);
        if(bid === undefined) return ActionTestResult.BThreadWithoutMatchingBid;
        if(bid.type === BidType.trigger) {
            if(!hasValidMatch(bidsByType, BidType.askFor, bid.eventId, bid) && !hasValidMatch(bidsByType, BidType.waitFor, bid.eventId, bid)) return ActionTestResult.unableToTrigger; 
        }
        return bid;
    }
    else if(action.type === ActionType.ui) { // when ok, will return askFor bids
        if(isBlocked(bidsByType, action.eventId, action)) return ActionTestResult.IsBlocked;
        const matchingAskForBids = getMatchingBids(bidsByType, [BidType.askFor], action.eventId);
        if(matchingAskForBids === undefined) return ActionTestResult.NotAskedFor;
        if(matchingAskForBids.every(bid => !isValid(bid, action.payload))) return ActionTestResult.IsInvalidPayload;
        return matchingAskForBids;
    }
    else if(action.type === ActionType.resolve) { // when ok, it will return a BThreadId
        if(action.bidType === undefined) return ActionTestResult.MissingBidType;
        const bThread = bThreadMap.get(action.bThreadId);
        if(bThread === undefined) return ActionTestResult.ResolvingBThreadNotFound;
        //TODO: check if there is pending in this thread.   if(bThread.resolvePending(action) === false) return ActionTestResult.EventWasCancelled
        return bThread.id;
    }
    else if(action.type === ActionType.reject) { // when ok, it will return a BThreadId
        const bThread = bThreadMap.get(action.bThreadId);
        if(bThread === undefined) return ActionTestResult.RejectBThreadNotFound;
        return bThread.id;

    }
}