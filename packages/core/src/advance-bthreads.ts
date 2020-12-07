import { Action, ActionType } from './action';
import { BidType, getMatchingBids, BidsByType, isBlocked} from './bid';
import { BThread } from './bthread';
import { BThreadMap } from './bthread-map';
import { EventMap } from './event-map';
import { CachedItem } from './event-cache';
import { isValid } from './validation';

const EXTENDED_WITH_PROMISE: unique symbol = Symbol('extended with promise');

// advance threads, based on selected action
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

function progressWait(activeBidsByType: BidsByType, bThreadMap: BThreadMap<BThread>, types: BidType[], action: Action): void {
    const matchingBids = getMatchingBids(activeBidsByType, types, action.eventId);
    if(matchingBids === undefined) return;
    matchingBids.forEach(bid => {
        if(isBlocked(activeBidsByType, bid.eventId, action)) return;
        if(!isValid(bid, action.payload)) return;
        bThreadMap.get(bid.bThreadId)?.progressWait(bid, action);
    });
    return;
}

function extendAction(activeBidsByType: BidsByType, bThreadMap: BThreadMap<BThread>, action: Action): undefined | typeof EXTENDED_WITH_PROMISE {
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
            progressWait(activeBidsByType, bThreadMap, [BidType.onPending], action);
            return EXTENDED_WITH_PROMISE;
        } else {
            action.payload = extendContext.value;
        }
    }
}

export function advanceBThreads(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: BidsByType, action: Action): void {
    switch (action.type) {
        case ActionType.request: {
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread === undefined) return;
            if(action.resolveActionId !== undefined) {
                bThread.addPendingEvent({...action}, false);
                progressWait(activeBidsByType, bThreadMap, [BidType.onPending], action);
                return;
            }
            if(extendAction(activeBidsByType, bThreadMap, action) === EXTENDED_WITH_PROMISE) return;
            bThread.progressRequest(eventCache, action);
            progressWait(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
            return;
        }
        case ActionType.ui: {
            if(extendAction(activeBidsByType, bThreadMap, action) === EXTENDED_WITH_PROMISE) return;
            progressWait(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
            return;
        }
        case ActionType.resolve: {
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread === undefined) return;
            if(bThread.resolvePending(action) === false) return;
            activeBidsByType.pending?.deleteSingle(action.eventId);
            if(extendAction(activeBidsByType, bThreadMap, action) === EXTENDED_WITH_PROMISE) return;
            bThread.progressRequest(eventCache, action);
            progressWait(activeBidsByType, bThreadMap, [BidType.askFor, BidType.waitFor], action);
            return;
        }
        case ActionType.reject: {
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread) {
                bThread.rejectPending(action);
            }
        }
    }
}
