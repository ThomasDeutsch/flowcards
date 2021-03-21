import { BidType, getMatchingBids, BidsByType, isBlocked, PlacedBid } from './bid';
import { BThread } from './bthread';
import { BThreadMap } from './bthread-map';
import { EventMap, EventId } from './event-map';
import { CachedItem } from './event-cache';
import { isValid } from './validation';
import { ActionType, getExtendedAction, RequestedAction } from '.';
import { isThenable } from './utils';
import { AnyAction, isResolveExtendAction, ResolveAction, ResolveExtendAction, UIAction } from './action';

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


function progressWaitingBThreads(activeBidsByType: BidsByType, bThreadMap: BThreadMap<BThread>, types: BidType[], action: AnyAction): boolean {
    const bThreadIds = getProgressingBids(activeBidsByType, types, action.eventId, action.payload);
    if(bThreadIds === undefined) return false;
    bThreadIds.forEach(bid => {
        bThreadMap.get(bid.bThreadId)?.progressWait(bid, action);
    });
    return true;
}


function extendAction(activeBidsByType: BidsByType, bThreadMap: BThreadMap<BThread>, extendedAction: AnyAction): 'ExtendedWithPromise' | undefined {
    const matchingExtendBids = getMatchingBids(activeBidsByType, [BidType.extend], extendedAction.eventId);
    if(matchingExtendBids === undefined) return undefined;
    while(matchingExtendBids && matchingExtendBids.length > 0) {
        const extendBid = matchingExtendBids.shift()!; // get bid with highest priority
        if(isBlocked(activeBidsByType, extendBid.eventId, extendedAction)) continue;
        if(!isValid(extendBid, extendedAction.payload)) continue;
        const extendingBThread = bThreadMap.get(extendBid.bThreadId);
        if(extendingBThread === undefined) continue;
        const extendContext = extendingBThread.progressExtend(extendedAction, extendBid);
        if(extendContext.promise) {
            const extend = getExtendedAction(extendedAction, extendContext, extendingBThread);
            extendingBThread.addPendingBid(extend, extendedAction);
            progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.onPending], extendedAction);
            return 'ExtendedWithPromise';
        } else {
            extendedAction.payload = extendContext.value;
        }
    }
}

// NEUE ACTION TYPES:  REQUESTED, UI, RESOLVED, REJECTED   &   REPLAY

export function advanceRequestedAction(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: BidsByType, action: RequestedAction): void {
    const requestingBThread = bThreadMap.get(action.requestingBThreadId);
    if(requestingBThread === undefined) return;
    if(action.type === ActionType.requested) {
        if (typeof action.payload === "function") {
            action.payload = action.payload(eventCache.get(action.eventId)?.value);
        }
        if(action.resolveActionId === 'checkPayloadForPromise' && isThenable(action.payload)) {
            requestingBThread.addPendingBid({...action, resolveActionId: 'notResolved'});
            progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.onPending], action);
            return;
        }
    }
    const extendResult = extendAction(activeBidsByType, bThreadMap, action);
    if( extendResult === 'ExtendedWithPromise') return;
    requestingBThread.progressRequested(eventCache, action);
    progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
}


export function advanceUiAction(bThreadMap: BThreadMap<BThread>, activeBidsByType: BidsByType, action: UIAction): void {
    if(extendAction(activeBidsByType, bThreadMap, action) === 'ExtendedWithPromise') return;
    progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
}


function resolveExtendAction(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: BidsByType, action: ResolveExtendAction): void {
    if(action.extendedAction.type === ActionType.requested) { // extended action originated from a requesting BThread
        const requestingBThread = bThreadMap.get(action.extendedAction.requestingBThreadId);
        if(requestingBThread === undefined) return;
        requestingBThread.progressResolved(eventCache, action);    
    }
    progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
}

export function advanceResolveAction(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: BidsByType, action: ResolveAction | ResolveExtendAction): void {
    const requestingBThread = bThreadMap.get(action.requestingBThreadId);
    if(requestingBThread === undefined) return;
    //requestingBThread.resolvePending(action);
    activeBidsByType.pending?.deleteSingle(action.eventId);
    if(extendAction(activeBidsByType, bThreadMap, action) === 'ExtendedWithPromise') return;
    if(isResolveExtendAction(action)) {
        resolveExtendAction(bThreadMap, eventCache, activeBidsByType, action);
    } else {
        requestingBThread.progressResolved(eventCache, action); 
        progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
    }
}

export function advanceRejectAction(bThreadMap: BThreadMap<BThread>, activeBidsByType: BidsByType, action: ResolveAction): void {
    const requestingBThread = bThreadMap.get(action.requestingBThreadId);
    if(requestingBThread === undefined) return;
    requestingBThread.rejectPending(action);
    activeBidsByType.pending?.deleteSingle(action.eventId);
    // TODO: add testcases for reject-behaviour
    //if(extendAction(activeBidsByType, bThreadMap, action)  === 'ExtendedWithPromise') return;
    //progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
}
