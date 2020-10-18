import { Action, ActionType } from './action';
import { BidType, getMatchingBids, ActiveBidsByType, isBlocked} from './bid';
import { BThread } from './bthread';
import { BThreadMap } from './bthread-map';
import { EventMap } from './event-map';
import { CachedItem } from './event-cache';
import { isValid } from './validation';

const EXTENDED_WITH_PROMISE: unique symbol = Symbol('extended with promise');

// advance threads, based on selected action
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

function progressWait(activeBidsByType: ActiveBidsByType, bThreadMap: BThreadMap<BThread>, types: BidType[], action: Action): boolean {
    const matchingBids = getMatchingBids(activeBidsByType, types, action.eventId);
    if(matchingBids === undefined) return false;
    matchingBids.forEach(bid => {
        if(isBlocked(activeBidsByType, bid.eventId, action)) return;
        if(!isValid(bid, action.payload)) return;
        bThreadMap.get(bid.bThreadId)?.progressWait(bid, action);
    });
    return true;
}

function extendAction(activeBidsByType: ActiveBidsByType, bThreadMap: BThreadMap<BThread>, action: Action): undefined | typeof EXTENDED_WITH_PROMISE {
    const bids = getMatchingBids(activeBidsByType, [BidType.extend], action.eventId);
    if(!bids || bids.length === 0) return;
    while(bids && bids.length > 0) {
        const bid = bids.pop(); // get last bid ( highest priority )
        if(bid === undefined) continue;
        if(isBlocked(activeBidsByType, bid.eventId, action)) continue;
        if(!isValid(bid, action.payload)) continue;
        const extendContext = bThreadMap.get(bid.bThreadId)?.progressExtend(action, bid);
        if(extendContext === undefined) continue;
        if(extendContext.promise) {
            action.payload = extendContext.promise;
            bThreadMap.get(action.bThreadId)?.addPendingEvent(action, true);
            progressWait(activeBidsByType, bThreadMap, [BidType.onPending], action);
            return EXTENDED_WITH_PROMISE;
        } else {
            action.payload = extendContext.value;
        }
    }
}

export function advanceBThreads(bThreadMap: BThreadMap<BThread>, eventCache: EventMap<CachedItem<any>>, activeBidsByType: ActiveBidsByType, action: Action): void {
    switch (action.type) {
        case ActionType.requested: {
            // requested bid was checked (not blocked and valid payload)
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread === undefined || action.bidType === undefined) return;
            const bid = bThread.currentBids?.[action.bidType]?.get(action.eventId);
            if(bid === undefined) return;
            if(action.resolveLoopIndex === null) {
                bThread.addPendingEvent(action, false);
                progressWait(activeBidsByType, bThreadMap, [BidType.onPending], action);
                return;
            }
            if(extendAction(activeBidsByType, bThreadMap, action) === EXTENDED_WITH_PROMISE) return;
            bThread.progressRequest(eventCache, action); // request got resolved
            progressWait(activeBidsByType, bThreadMap, [BidType.wait, BidType.on], action);
            return;
        }
        case ActionType.ui: {
            if(extendAction(activeBidsByType, bThreadMap, action) === EXTENDED_WITH_PROMISE) return;
            const isValidDispatch = progressWait(activeBidsByType, bThreadMap, [BidType.wait, BidType.on], action);
            if(!isValidDispatch) console.warn(`no wait for action: ${action.eventId.name}` + (action.eventId.key !== undefined) ? ` with key ${action.eventId.key}` : '');
            return;
        }
        case ActionType.resolved: {
            const bThread = bThreadMap.get(action.bThreadId);
            if(bThread === undefined) return;
            if(bThread.resolvePending(action) === false) return;
            activeBidsByType.pending?.deleteSingle(action.eventId);
            if(extendAction(activeBidsByType, bThreadMap, action) === EXTENDED_WITH_PROMISE) return;
            bThread.progressRequest(eventCache, action); // request got resolved
            progressWait(activeBidsByType, bThreadMap, [BidType.wait, BidType.on], action);
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
