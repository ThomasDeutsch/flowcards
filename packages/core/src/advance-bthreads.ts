import { Action, ActionType } from './action';
import { BidType, getMatchingBids, BidsByType, isBlocked} from './bid';
import { BThread } from './bthread';
import { BThreadMap } from './bthread-map';
import { EventMap } from './event-map';
import { CachedItem } from './event-cache';

const EXTENDED_WITH_PROMISE: unique symbol = Symbol('extended with promise');

// advance threads, based on selected action
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

function progressWait(bidsByType: BidsByType, bThreadMap: BThreadMap<BThread>, types: BidType[], action: Action): boolean {
    const matchingBids = getMatchingBids(bidsByType, types, action.event);
    if(matchingBids === undefined) return false;
    matchingBids.forEach(bid => {
        if(isBlocked(bidsByType, bid.event, action)) return;
        bThreadMap.get(bid.bThreadId)?.progressWait(bid, action);
    });
    return true;
}

function extendAction(bidsByType: BidsByType, bThreadMap: BThreadMap<BThread>, action: Action): undefined | typeof EXTENDED_WITH_PROMISE {
    const bids = getMatchingBids(bidsByType, [BidType.extend], action.event);
    if(!bids || bids.length === 0) return;
    while(bids && bids.length > 0) {
        const bid = bids.pop(); // get last bid ( highest priority )
        if(bid === undefined) continue;
        const extendContext = bThreadMap.get(bid.bThreadId)?.progressExtend(action, bid);
        if(extendContext === undefined) continue;
        if(extendContext.promise) {
            action.payload = extendContext.promise;
            bThreadMap.get(action.bThreadId)?.addPendingEvent(action, true);
            progressWait(bidsByType, bThreadMap, [BidType.onPending], action);
            return EXTENDED_WITH_PROMISE;
        } else {
            action.payload = extendContext.value;
        }
    }
}

export function advanceBThreads(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, bidsByType: BidsByType, action: Action): void {
    switch (action.type) {
        case ActionType.requested: {
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread === undefined) return;
            const bid = bThread.currentBids?.request?.get(action.event);
            if(bid === undefined) return;
            if(action.resolveLoopIndex !== undefined) {
                bThread.addPendingEvent(action, false);
                progressWait(bidsByType, bThreadMap, [BidType.onPending], action);
                return;
            }
            if(extendAction(bidsByType, bThreadMap, action) === EXTENDED_WITH_PROMISE) return;
            bThread.progressRequest(eventCache, action); // request got resolved
            progressWait(bidsByType, bThreadMap, [BidType.wait, BidType.on], action);
            return;
        }
        case ActionType.ui: {
            if(extendAction(bidsByType, bThreadMap, action) === EXTENDED_WITH_PROMISE) return;
            const isValidDispatch = progressWait(bidsByType, bThreadMap, [BidType.wait, BidType.on], action);
            if(!isValidDispatch) console.warn(`no wait for action: ${action.event.name}` + (action.event.key !== undefined) ? ` with key ${action.event.key}` : '');
            return;
        }
        case ActionType.resolved: {
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread === undefined) return;
            if(bThread.resolvePending(action) === false) return;
            if(extendAction(bidsByType, bThreadMap, action) === EXTENDED_WITH_PROMISE) return;
            bThread.progressRequest(eventCache, action); // request got resolved
            progressWait(bidsByType, bThreadMap, [BidType.wait, BidType.on], action);
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
