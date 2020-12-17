import { Action } from './action';
import { BidType, getMatchingBids, BidsByType, isBlocked, Bid } from './bid';
import { BThread } from './bthread';
import { BThreadMap } from './bthread-map';
import { EventMap, EventId } from './event-map';
import { CachedItem } from './event-cache';
import { isValid } from './validation';

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


function extendAction(activeBidsByType: BidsByType, bThreadMap: BThreadMap<BThread>, action: Action): 'ExtendedWithPromise' | undefined {
    const matchingBids = getMatchingBids(activeBidsByType, [BidType.extend], action.eventId);
    if(matchingBids === undefined) return undefined;
    while(matchingBids && matchingBids.length > 0) {
        const bid = matchingBids.shift()!; // get bid with highest priority
        if(isBlocked(activeBidsByType, bid.eventId, action)) continue;
        if(!isValid(bid, action.payload)) continue;
        const extendContext = bThreadMap.get(bid.bThreadId)?.progressExtend(action, bid);
        if(extendContext === undefined) continue;
        if(extendContext.promise) {
            action.payload = extendContext.promise;
            const bThreadId = action.bThreadId.name ? action.bThreadId : bid.bThreadId;
            bThreadMap.get(bThreadId)?.addPendingEvent(action, true);
            progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.onPending], action);
            return 'ExtendedWithPromise';
        } else {
            action.payload = extendContext.value;
        }
    }
}

export function advanceRequestAction(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: BidsByType, action: Action): void {
    const bThread = bThreadMap.get(action.bThreadId)!;
    if(action.resolveActionId !== undefined) {
        bThread.addPendingEvent({...action}, false);
        progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.onPending], action);
        return;
    }
    if(extendAction(activeBidsByType, bThreadMap, action) === 'ExtendedWithPromise') return;
    bThread.progressRequest(eventCache, action);
    progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
}


export function advanceUiAction(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: BidsByType, action: Action): void {
    if(extendAction(activeBidsByType, bThreadMap, action)  === 'ExtendedWithPromise') return;
    progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
}


export function advanceResolveAction(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: BidsByType, action: Action): void {
    const bThread = bThreadMap.get(action.bThreadId)!;
    bThread.resolvePending(action);
    activeBidsByType.pending?.deleteSingle(action.eventId);
    if(extendAction(activeBidsByType, bThreadMap, action) === 'ExtendedWithPromise') return;
    if(action.bidType !== BidType.extend) {
        bThread.progressRequest(eventCache, action);
    }
    progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
}

export function advanceRejectAction(bThreadMap: BThreadMap<BThread>, activeBidsByType: BidsByType, action: Action): void {
    const bThread = bThreadMap.get(action.bThreadId)!;
    bThread.rejectPending(action);
    if(action.bidType === BidType.extend) {
        activeBidsByType.pending?.deleteSingle(action.eventId);
        if(extendAction(activeBidsByType, bThreadMap, action)  === 'ExtendedWithPromise') return;
        progressWaitingBThreads(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
    }
}
