import { EventMap, EventId, toEventId } from './event-map';
import { Validation, withValidPayload } from './validation';
import * as utils from './utils';
import { PendingEventInfo, BThreadId } from './bthread';
import { flattenShallow } from './utils';

export enum BidType {
    request = "request",
    askFor = "askFor",
    block = "block",
    pending = "pending",
    guardedBlock = "guardedBlock",
    extend = "extend",
    trigger = "trigger",
    set = "set",
    waitFor = "waitFor",
    onPending = "onPending"
}

export type RequestBidType = BidType.request | BidType.trigger | BidType.set;

export interface Bid {
    type: BidType;
    bThreadId: BThreadId;
    eventId: EventId;
    payload?: any;
    validate?: Validation;
}

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export type BThreadBids = Record<BidType, EventMap<Bid>>;
type BidOrBids =  Bid | undefined | (Bid | undefined)[];


export function getBidsForBThread(bThreadId: BThreadId, bidOrBids: BidOrBids, pendingEvents: EventMap<PendingEventInfo>): BThreadBids {
    let bidColl = utils.toArray(bidOrBids).filter(utils.notUndefined).filter(bid => !pendingEvents.has(bid.eventId));
    const pendingBids: Bid[] | undefined = pendingEvents.allValues?.map(info => ({
        type: BidType.pending,
        bThreadId: info.bThreadId,
        eventId: info.eventId
    }));
    bidColl = [...bidColl, ...(pendingBids || [])];
    const bids = {} as BThreadBids;
    if(bidColl.length === 0) return bids;
    return bidColl.reduce((acc: BThreadBids, bid: Bid): BThreadBids => {
        if(bid !== undefined) {
            if(!acc[bid.type]) {
                acc[bid.type] = new EventMap();
            }
            acc[bid.type]!.set(bid.eventId, {...bid, bThreadId: bThreadId});
        }
        return acc;
    }, bids);
}

// bids from multiple BThreads
// --------------------------------------------------------------------------------------------------------------------

export type BidsByType = Record<BidType, EventMap<Bid[]> | undefined>;

export function activeBidsByType(allBThreadBids: BThreadBids[]): BidsByType {
    const activeBidsByType = {} as BidsByType;
    allBThreadBids.forEach((bids) => {
        for(const type in bids) {
            const bidsByEvent = bids[type as BidType];
            if(bidsByEvent !== undefined) {
                if(activeBidsByType[type as BidType] === undefined) activeBidsByType[type as BidType] = new EventMap<Bid[]>();
                bidsByEvent.forEach((event, bid) => {
                    activeBidsByType[type as BidType]!.set(event, [bid, ...(activeBidsByType[type as BidType]!.get(event) || [])]);
                })
            }
        }
    });
    return activeBidsByType;
}

type WithPayload = {payload?: any};

export function isBlocked(bidsByType: BidsByType, event: EventId, withPayload?: WithPayload): boolean {
    if(bidsByType.block !== undefined) {
        if(bidsByType.block.hasMatching(event)) return true
    }
    if(bidsByType.pending !== undefined) {
        if(bidsByType.pending.hasMatching(event)) return true;
    }
    if(withPayload && bidsByType.guardedBlock !== undefined) {
        const blockBids = flattenShallow(bidsByType.guardedBlock.getExactMatchAndUnkeyedMatch(event));
        return withValidPayload(blockBids, withPayload.payload);
    }
    return false;
}

export function getActiveBidsForSelectedTypes(activeBidsByType: BidsByType, types: BidType[]): Bid[] | undefined {
    const result = types.reduce((acc: Bid[], type: BidType) => {
        const bids = utils.flattenShallow(activeBidsByType[type]?.allValues);
        if(bids === undefined) return acc;
        acc.push(...bids);
        return acc;
    }, []);
    if(result.length === 0) return undefined;
    return result;
}

export function hasValidMatch(bidsByType: BidsByType, bidType: BidType, event: EventId, withPayload?: WithPayload): boolean {
    const bidsMap = bidsByType[bidType];
    const bids = flattenShallow(bidsMap?.getExactMatchAndUnkeyedMatch(event));
    if(bids === undefined) return false;
    if(withPayload === undefined) return true;
    return withValidPayload(bids, withPayload.payload);
}

export function getMatchingBids(bidsByType: BidsByType, types: BidType[], event: EventId): Bid[] | undefined {
    const result = types.reduce((acc: Bid[], type: BidType) => {
        if(bidsByType[type] === undefined) return acc;
        const matchingBids = bidsByType[type]!.getExactMatchAndUnkeyedMatch(event);
        if(matchingBids === undefined || matchingBids.length === 0) return acc;
        acc.push(...utils.flattenShallow(matchingBids)!);
        return acc;
    }, []);
    return result.length === 0 ? undefined : result;
}

export function getNextBidAndRemaining(bids: Bid[]): [Bid, Bid[]] {
    const [nextBid, ...remainingBids] = bids;
    return [nextBid, remainingBids]
}


// bids user-API --------------------------------------------------------------------

export function request(event: string | EventId, payload?: unknown): Bid {
    return {
        type: BidType.request,
        eventId: toEventId(event), 
        payload: payload, 
        bThreadId: {name: ""}
    };
}

export function set(event: string | EventId, payload?: unknown): Bid {
    return {
        type: BidType.set,
        eventId: toEventId(event), 
        payload: payload,
        bThreadId: {name: ""}
    };
}

export function trigger(event: string | EventId, payload?: unknown): Bid {
    return {
        type: BidType.trigger,
        eventId: toEventId(event), 
        payload: payload,
        bThreadId: {name: ""}
    };
}

export function askFor(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.askFor,
        eventId: toEventId(event), 
        validate: validation,
        bThreadId: {name: ""}
    };
}

export function waitFor(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.waitFor,
        eventId: toEventId(event), 
        validate: validation,
        bThreadId: {name: ""}
    };
}

export function onPending(event: string | EventId): Bid {
    return { 
        type: BidType.onPending,
        eventId: toEventId(event),
        bThreadId: {name: ""}
    };
}

export function block(event: string | EventId, blockIf?: Validation): Bid {
    return { 
        type: (typeof blockIf === 'function') ? BidType.guardedBlock : BidType.block,
        eventId: toEventId(event), 
        validate: blockIf, 
        bThreadId: {name: ""}
    };
}

export function extend(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.extend,
        eventId: toEventId(event), 
        validate: validation, 
        bThreadId: {name: ""}
    };
}

