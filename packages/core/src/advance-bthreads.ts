import { Action, ActionType } from './action';
import { AllBidsByType, BidSubType, BidType, getMatchingBids } from './bid';
import { BThread } from './bthread';
import { BThreadMap } from './bthread-map';
import { EventMap } from './event-map';
import { CachedItem } from './event-cache';

// advance threads, based on selected action
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

function advanceWaits(allBids: AllBidsByType, bThreadMap: BThreadMap<BThread>, action: Action): boolean {
    const bids = (getMatchingBids(allBids[BidType.wait], action.event) || [])
    .filter(bid => (bid.subType !== BidSubType.onPending) && !allBids.block?.has(bid.event) && !allBids.block?.has({name: bid.event.name}));
    if(bids.length === 0) return false;
    bids.forEach(bid => {
        bThreadMap.get(bid.bThreadId)?.progressWait(bid, action);
    });
    return true;
}

function advanceOnPending(allBids: AllBidsByType, bThreadMap: BThreadMap<BThread>, action: Action): boolean {
    const bids = (getMatchingBids(allBids[BidType.wait], action.event) || [])
        .filter(bid => (bid.subType === BidSubType.onPending) && !allBids.block?.has(bid.event) && !allBids.block?.has({name: bid.event.name}));
    if(bids.length === 0) return false;
    bids.forEach(bid => {
        bThreadMap.get(bid.bThreadId)?.progressWait(bid, action);
    });
    return true;
}

function extendAction(allBids: AllBidsByType, bThreadMap: BThreadMap<BThread>, action: Action): undefined | 'extended with promise' {
    const bids = getMatchingBids(allBids[BidType.extend], action.event);
    if(!bids || bids.length === 0) return;
    while(bids && bids.length > 0) {
        const bid = bids.pop(); // get last bid ( highest priority )
        if(bid === undefined) continue;
        const extendContext = bThreadMap.get(bid.bThreadId)?.progressExtend(action, bid);
        if(extendContext === undefined) continue;
        if(extendContext.promise) {
            action.payload = extendContext.promise;
            bThreadMap.get(action.bThreadId)?.addPendingEvent(action, true);
            advanceOnPending(allBids, bThreadMap, action);
            return 'extended with promise';
        } else {
            action.payload = extendContext.value;
        }
    }
}

export function advanceBThreads(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, allBids: AllBidsByType, action: Action): void {
    switch (action.type) {
        case ActionType.requested: {
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread === undefined) return;
            const bid = bThread.currentBids?.request?.get(action.event);
            if(bid === undefined) return;
            if(action.resolveLoopIndex !== undefined) {
                bThread.addPendingEvent(action, false);
                advanceOnPending(allBids, bThreadMap, action);
                return;
            }
            if(extendAction(allBids, bThreadMap, action) === 'extended with promise') return;
            bThread.progressRequest(eventCache, action); // request got resolved
            advanceWaits(allBids, bThreadMap, action);
            return;
        }
        case ActionType.ui: {
            if(extendAction(allBids, bThreadMap, action) === 'extended with promise') return;
            const isValidDispatch = advanceWaits(allBids, bThreadMap, action);
            if(!isValidDispatch) console.warn(`no wait for action: ${action.event.name}` + (action.event.key !== undefined) ? ` with key ${action.event.key}` : '');
            return;
        }
        case ActionType.resolved: {
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread === undefined) return;
            if(bThread.resolvePending(action) === false) return;
            if(extendAction(allBids, bThreadMap, action) === 'extended with promise') return;
            bThread.progressRequest(eventCache, action); // request got resolved
            advanceWaits(allBids, bThreadMap, action);
            return;
        }
        case ActionType.rejected: {
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread) {
                bThread.rejectPending(action);
            }
        }
    }
}
