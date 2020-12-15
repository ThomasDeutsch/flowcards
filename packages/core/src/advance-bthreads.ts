import { Action, ActionType } from './action';
import { BidType, getMatchingBids, BidsByType, isBlocked, Bid } from './bid';
import { BThread, BThreadId } from './bthread';
import { BThreadMap } from './bthread-map';
import { EventMap, EventId } from './event-map';
import { CachedItem } from './event-cache';
import { isValid } from './validation';

export enum ActionResult {
    OK,
    ExtendedWithPromise,
    RequestingBThreadNotFound,
    NoBThreadAskedForEvent,
    ResolveBThreadNotFound,
    ResolveCancelled,
    RejectBThreadNotFound,
    CreatedPendingEvent,
    MissingBidType,
    NoActiveBidForRequest
}

// advance threads, based on selected action
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export function getProgressingBids(activeBidsByType: BidsByType, types: BidType[], eventId: EventId, payload: any): Bid[] | undefined {
    const matchingBids = getMatchingBids(activeBidsByType, types, eventId);
    if(matchingBids === undefined) return undefined;
    const progressingBids: Bid[] = [];
    matchingBids.forEach(bid => {
        if(isBlocked(activeBidsByType, bid.eventId, {payload: payload})) return undefined;
        if(!isValid(bid, payload)) return undefined;
        progressingBids.push(bid);
    });
    return progressingBids.length === 0 ? undefined : progressingBids;
}


function progressWaitingBThreads(activeBidsByType: BidsByType, bThreadMap: BThreadMap<BThread>, types: BidType[], action: Action): boolean {
    const bThreadIds = getProgressingBids(activeBidsByType, types, action.eventId, action.payload);
    if(bThreadIds === undefined) return false;
    bThreadIds.forEach(bid => {
        bThreadMap.get(bid.bThreadId)?.progressWait(bid, action);
    });
    return true;
}

function extendAction(activeBidsByType: BidsByType, bThreadMap: BThreadMap<BThread>, action: Action): ActionResult.ExtendedWithPromise | undefined {
    const bids = getMatchingBids(activeBidsByType, [BidType.extend], action.eventId);
    if(!bids || bids.length === 0) return;
    while(bids && bids.length > 0) {
        const bid = bids.shift(); // get bid with highest priority
        if(bid === undefined) continue;
        if(isBlocked(activeBidsByType, bid.eventId, action)) continue;
        if(!isValid(bid, action.payload)) continue;
        const extendContext = bThreadMap.get(bid.bThreadId)?.progressExtend(action, bid);
        if(extendContext === undefined) continue;
        if(extendContext.promise) {
            action.payload = extendContext.promise;
            const bThreadId = action.bThreadId.name ? action.bThreadId : bid.bThreadId;
            bThreadMap.get(bThreadId)?.addPendingEvent(action, true);
            progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.onPending], action);
            return ActionResult.ExtendedWithPromise;
        } else {
            action.payload = extendContext.value;
        }
    }
}

export function advanceBThreads(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: BidsByType, action: Action): ActionResult {
    switch (action.type) {
        case ActionType.request: {
            if(action.bidType === undefined) return ActionResult.MissingBidType;
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread === undefined) return ActionResult.RequestingBThreadNotFound;
            if(!bThread.hasActiveBid) return ActionResult.NoActiveBidForRequest
            if(action.resolveActionId !== undefined) {
                bThread.addPendingEvent({...action}, false);
                progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.onPending], action);
                return ActionResult.CreatedPendingEvent;
            }
            if(extendAction(activeBidsByType, bThreadMap, action)) return ActionResult.ExtendedWithPromise;
            bThread.progressRequest(eventCache, action);
            progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
            return ActionResult.OK;
        }
        case ActionType.ui: {
            if(extendAction(activeBidsByType, bThreadMap, action) === ActionResult.ExtendedWithPromise) return ActionResult.ExtendedWithPromise;
            const someAskForProgressed = progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor], action);
            if(!someAskForProgressed) return ActionResult.NoBThreadAskedForEvent;
            progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.waitFor], action);
            return ActionResult.OK;
        }
        case ActionType.resolve: {
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread === undefined) return ActionResult.ResolveBThreadNotFound;
            if(bThread.resolvePending(action) === false) return ActionResult.ResolveCancelled
            activeBidsByType.pending?.deleteSingle(action.eventId);
            if(extendAction(activeBidsByType, bThreadMap, action) === ActionResult.ExtendedWithPromise) ActionResult.ExtendedWithPromise;
            bThread.progressRequest(eventCache, action);
            progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
            return ActionResult.OK;
        }
        case ActionType.reject: {
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread === undefined) return ActionResult.RejectBThreadNotFound;
            bThread.rejectPending(action);
            return ActionResult.OK;
        }
    }
}
