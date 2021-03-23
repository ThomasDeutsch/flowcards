import { EventMap, EventId, toEventId } from './event-map';
import { Validation, withValidPayload } from './validation';
import * as utils from './utils';
import { BThreadId } from './bthread';
import { flattenShallow } from './utils';
import { PendingBid } from './pending-bid';

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


export interface Bid {
    type: BidType;
    eventId: EventId;
    payload?: any;
    validate?: Validation;
}


export interface PlacedBid extends Bid {
    bThreadId: BThreadId;
}


export type RequestingBidType = BidType.request | BidType.trigger | BidType.set;


export interface PlacedRequestingBid extends Bid {
    type: RequestingBidType;
    bThreadId: BThreadId;
}

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export type BThreadBids = Record<BidType, EventMap<PlacedBid>>; //TODO: add pending bid type.
export type BidOrBids =  Bid | (Bid | undefined)[] | undefined;


export function getPlacedBidsForBThread(bThreadId: BThreadId, bidOrBids: BidOrBids, pendingBidMap: EventMap<PendingBid>): BThreadBids {
    let bidColl = utils.toArray(bidOrBids).filter(utils.notUndefined).filter(bid => !pendingBidMap.has(bid.eventId));
    const pendingBids = pendingBidMap.allValues?.map(bid => ({...bid, type: BidType.pending}));
    bidColl = bidColl.concat(pendingBids || []);
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

export type BidsByType = Record<BidType, EventMap<PlacedBid[]> | undefined>;

export function activeBidsByType(allBThreadBids: BThreadBids[]): BidsByType {
    const activeBidsByType = {} as BidsByType;
    allBThreadBids.forEach((bids) => {
        for(const type in bids) {
            const bidsByEvent = bids[type as BidType];
            if(bidsByEvent !== undefined) {
                if(activeBidsByType[type as BidType] === undefined) activeBidsByType[type as BidType] = new EventMap<PlacedBid[]>();
                bidsByEvent.forEach((event, bid) => {
                    activeBidsByType[type as BidType]!.set(event, [bid, ...(activeBidsByType[type as BidType]!.get(event) || [])]);
                })
            }
        }
    });
    return activeBidsByType;
}

type WithPayload = {payload?: any};

export function isBlocked(activeBidsByType: BidsByType, event: EventId, withPayload?: WithPayload): boolean {
    if(activeBidsByType.block !== undefined) {
        if(activeBidsByType.block.hasMatching(event)) return true
    }
    if(activeBidsByType.pending !== undefined) {
        if(activeBidsByType.pending.hasMatching(event)) return true;
    }
    if(withPayload !== undefined && activeBidsByType.guardedBlock !== undefined) {
        const blockBids = flattenShallow(activeBidsByType.guardedBlock.getExactMatchAndUnkeyedMatch(event));
        return withValidPayload(blockBids, withPayload.payload);
    }
    return false;
}

export function getRequestingBids(activeBidsByType: BidsByType): PlacedRequestingBid[] | undefined {
    const result = [BidType.request, BidType.set, BidType.trigger].reduce((acc: PlacedRequestingBid[], type: BidType) => {
        const bids = utils.flattenShallow(activeBidsByType[type]?.allValues) as PlacedRequestingBid[];
        if(bids === undefined || bids.length === 0) return acc;
        const notBlockedBids = bids.filter(bid => !isBlocked(activeBidsByType, bid.eventId));
        acc.push(...notBlockedBids);
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

export function getMatchingBids(bidsByType: BidsByType, types: BidType[], event: EventId): PlacedBid[] | undefined {
    const result = types.reduce((acc: PlacedBid[], type: BidType) => {
        if(bidsByType[type] === undefined) return acc;
        const matchingBids = bidsByType[type]!.getExactMatchAndUnkeyedMatch(event);
        if(matchingBids === undefined || matchingBids.length === 0) return acc;
        acc.push(...utils.flattenShallow(matchingBids)!);
        return acc;
    }, []);
    return result.length === 0 ? undefined : result;
}

export function getNextBidAndRemaining(bids: PlacedBid[]): [PlacedBid, PlacedBid[]] {
    const [nextBid, ...remainingBids] = bids;
    return [nextBid, remainingBids]
}


// bids user-API --------------------------------------------------------------------

export function request(event: string | EventId, payload?: unknown): Bid {
    return {
        type: BidType.request,
        eventId: toEventId(event), 
        payload: payload
    };
}

export function set(event: string | EventId, payload?: unknown): Bid {
    return {
        type: BidType.set,
        eventId: toEventId(event), 
        payload: payload
    };
}

export function trigger(event: string | EventId, payload?: unknown): Bid {
    return {
        type: BidType.trigger,
        eventId: toEventId(event), 
        payload: payload
    };
}

export function askFor(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.askFor,
        eventId: toEventId(event), 
        validate: validation
    };
}

export function waitFor(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.waitFor,
        eventId: toEventId(event), 
        validate: validation
    };
}

export function onPending(event: string | EventId): Bid {
    return { 
        type: BidType.onPending,
        eventId: toEventId(event)
    };
}

export function block(event: string | EventId, blockIf?: Validation): Bid {
    return { 
        type: (typeof blockIf === 'function') ? BidType.guardedBlock : BidType.block,
        eventId: toEventId(event), 
        validate: blockIf
    };
}

export function extend(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.extend,
        eventId: toEventId(event), 
        validate: validation
    };
}