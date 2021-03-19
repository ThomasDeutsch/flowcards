import { Action } from './action';
import { BidType, getMatchingBids, BidsByType, isBlocked, PlacedBid } from './bid';
import { BThread } from './bthread';
import { BThreadMap } from './bthread-map';
import { EventMap, EventId } from './event-map';
import { CachedItem } from './event-cache';
import { isValid } from './validation';

// advance threads, based on selected action
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export function getProgressingBids(activeBidsByType: BidsByType, types: BidType[], eventId: EventId, payload: any): PlacedBid[] | undefined {
    const matchingBids = getMatchingBids(activeBidsByType, types, eventId);
    if(matchingBids === undefined) return undefined;
    const progressingBids: PlacedBid[] = [];
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


function extendAction(activeBidsByType: BidsByType, bThreadMap: BThreadMap<BThread>, action: Action): 'ExtendedWithPromise' | undefined {
    const matchingExtendBids = getMatchingBids(activeBidsByType, [BidType.extend], action.eventId);
    if(matchingExtendBids === undefined) return undefined;
    while(matchingExtendBids && matchingExtendBids.length > 0) {
        const extendBid = matchingExtendBids.shift()!; // get bid with highest priority
        if(isBlocked(activeBidsByType, extendBid.eventId, action)) continue;
        if(!isValid(extendBid, action.payload)) continue;
        const extendingBThread = bThreadMap.get(extendBid.bThreadId);
        if(extendingBThread === undefined) continue;
        const extendContext = extendingBThread.progressExtend(action, extendBid);
        if(extendContext.promise) {
            action.payload = extendContext.promise;
            extendingBThread.addPendingEvent(action, true);
            progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.onPending], action);
            return 'ExtendedWithPromise';
        } else {
            action.payload = extendContext.value;
        }
    }
}


export function advanceRequestedAction(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: BidsByType, action: Action): void {
    const bThread = bThreadMap.get(action.bThreadId)!;
    if(action.resolveActionId !== undefined) {
        bThread.addPendingEvent({...action});
        progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.onPending], action);
        return;
    }
    const extendResult = extendAction(activeBidsByType, bThreadMap, action);
    if( extendResult === 'ExtendedWithPromise') return;
    bThread.progressRequested(eventCache, action);
    progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
}


export function advanceUiAction(bThreadMap: BThreadMap<BThread>, activeBidsByType: BidsByType, action: Action): void {
    if(extendAction(activeBidsByType, bThreadMap, action) === 'ExtendedWithPromise') return;
    progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
}


function resolveExtendAction(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: BidsByType, action: Action, extendedAction: Action) {
    const resolveBThreadId = extendedAction.bThreadId.name ? extendedAction.bThreadId : action.bThreadId;
    const requesingBThread = bThreadMap.get(resolveBThreadId);
    if(!requesingBThread) return;
    action = {...extendedAction, payload: action.payload};
    if(action.bThreadId.name) { // extended action originated from a requesting BThread
        const bThread = bThreadMap.get(action.bThreadId);
        if(!bThread) return;
        bThread!.progressRequested(eventCache, action);    
    }
    progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
}

export function advanceResolveAction(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: BidsByType, action: Action): void {
    const bThread = bThreadMap.get(action.bThreadId);
    if(!bThread) return;
    bThread.resolvePending(action);
    activeBidsByType.pending?.deleteSingle(action.eventId);
    if(extendAction(activeBidsByType, bThreadMap, action) === 'ExtendedWithPromise') return;
    if(action.resolve?.extendedAction) {
        resolveExtendAction(bThreadMap, eventCache, activeBidsByType, action, action.resolve.extendedAction);
    } else {
        bThread.progressRequested(eventCache, action); 
        progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
    }
}

export function advanceRejectAction(bThreadMap: BThreadMap<BThread>, activeBidsByType: BidsByType, action: Action): void {
    const bThread = bThreadMap.get(action.bThreadId)!;
    bThread.rejectPending(action);
    activeBidsByType.pending?.deleteSingle(action.eventId);
    // TODO: add testcases for reject-behaviour
    //if(extendAction(activeBidsByType, bThreadMap, action)  === 'ExtendedWithPromise') return;
    //progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
}
