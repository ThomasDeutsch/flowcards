import * as utils from "./utils";
import { EventMap, reduceEventMaps, EventKey, toEvent, EventName, FCEvent } from "./event";
import { GuardFunction, getGuardedUnguardedBlocks, combineGuards } from './guard';

export enum BidType {
    request = "request",
    wait = "wait",
    block = "block",
    extend = "extend", 
    pending = "pending"
}

export interface Bid {
    type: BidType;
    threadId: string;
    event: FCEvent;
    payload?: any;
    guard?: GuardFunction;
    canBeDispatched?: boolean;
    cacheEnabled?: boolean;
    onlyRequestWhenWaitedFor?: boolean;
}

export type BidByEventNameAndKey = Record<EventName, Record<EventKey, Bid>>;
export type AllBidsByEventNameAndKey = Record<EventName, Record<EventKey, Bid[]>>;
export type BidsForBidType = EventMap<Bid[]> | undefined;

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export interface BThreadBids {
    withMultipleBids?: boolean;
    [BidType.pending]?: EventMap<Bid>;
    [BidType.request]?: EventMap<Bid>;
    [BidType.wait]?: EventMap<Bid>;
    [BidType.block]?: EventMap<Bid>;
    [BidType.extend]?: EventMap<Bid>;
}

export function getBidsForBThread(threadId: string, bidOrBids: Bid | undefined | (Bid | undefined)[]): BThreadBids | undefined {
    if(!bidOrBids) return undefined;
    const bids = utils.toArray(bidOrBids).filter(utils.notUndefined);
    const defaultBidsByType = {
        withMultipleBids: Array.isArray(bidOrBids)
    }
    if(bids.length === 0) return defaultBidsByType;
    return bids.reduce((acc: BThreadBids, bid: Bid | undefined): BThreadBids => {
        if(bid) {
            if(!acc[bid.type]) {
                acc[bid.type] = new EventMap();
            }
            acc[bid.type]!.set(bid.event, {...bid, threadId: threadId});
        }
        return acc;
    }, defaultBidsByType);
}

// bids from multiple BThreads
// --------------------------------------------------------------------------------------------------------------------
function bidsForType(type: BidType, allBidsByType: BThreadBids[]): EventMap<Bid>[] {
    return allBidsByType.map(bidsByType => bidsByType[type]).filter(utils.notUndefined);
}

function reduceMaps(allBidsForType: (EventMap<Bid> | undefined)[], blocks?: Set<FCEvent>, guardedBlocks?: EventMap<GuardFunction>): EventMap<Bid[]> | undefined {
    const reduced = reduceEventMaps(allBidsForType, (acc: Bid[] = [], curr: Bid) => [...acc, curr]);
    if(blocks && reduced) blocks.forEach(event => reduced.delete(event));
    if(guardedBlocks && reduced) combineGuards(reduced, guardedBlocks);
    return reduced;
}

export interface AllBidsByType {
    [BidType.pending]?: EventMap<Bid[]>;
    [BidType.request]?: EventMap<Bid[]>;
    [BidType.wait]?: EventMap<Bid[]>;
    [BidType.extend]?: EventMap<Bid[]>;
}

export function getAllBids(allBThreadBids: BThreadBids[]): AllBidsByType {
    const pending = reduceMaps(bidsForType(BidType.pending, allBThreadBids));
    const pendingEvents = new Set(pending?.allEvents);
    const blocks = reduceMaps(bidsForType(BidType.block, allBThreadBids));
    const [fixedBlocks, guardedBlocks] = getGuardedUnguardedBlocks(blocks);
    const fixedBlocksAndPending = utils.union(pendingEvents, fixedBlocks);
    return {
        [BidType.pending]: pending,
        [BidType.request]: reduceMaps(bidsForType(BidType.request, allBThreadBids), fixedBlocksAndPending, guardedBlocks),
        [BidType.wait]: reduceMaps(bidsForType(BidType.wait, allBThreadBids), fixedBlocks, guardedBlocks),
        [BidType.extend]: reduceMaps(bidsForType(BidType.extend, allBThreadBids), fixedBlocks, guardedBlocks)
    };
}

export function getMatchingBids(bids?: EventMap<Bid[]>, event?: FCEvent): Bid[] | undefined {
    if(bids === undefined) return undefined
    const result = bids.getAllMatchingValues(event);
    if(result === undefined) return undefined;
    return utils.flattenShallow(result);
}


// bids User-API --------------------------------------------------------------------

export function request(event: string | FCEvent, payload?: any): Bid {
    return {
        type: BidType.request, 
        event: toEvent(event), 
        payload: payload, 
        threadId: ""
    };
}

export function wait(event: string | FCEvent, guard?: GuardFunction): Bid {
    return { 
        type: BidType.wait, 
        event: toEvent(event), 
        guard: guard,
        canBeDispatched: true,
        threadId: "" 
    };
}

export function block(event: string | FCEvent, guard?: GuardFunction): Bid {
    return { 
        type: BidType.block, 
        event: toEvent(event), 
        guard: guard, 
        threadId: ""
    };
}

export function set(event: string | FCEvent, payload?: any): Bid {
    return {
        type: BidType.request, 
        event: toEvent(event), 
        payload: payload, 
        threadId: "",
        cacheEnabled: true
    };
}

export function extend(event: string | FCEvent, guard?: GuardFunction | null, payload?: any): Bid {
    return { 
        type: BidType.extend, 
        event: toEvent(event), 
        guard: guard !== null ? guard : undefined, 
        threadId: "", payload: payload
    };
}

export function on(event: string | FCEvent, guard?: GuardFunction): Bid {
    return { 
        type: BidType.wait, 
        event: toEvent(event), 
        guard: guard,
        canBeDispatched: false,
        threadId: "" 
    };
}

export function trigger(event: string | FCEvent, payload?: any): Bid {
    return {
        type: BidType.request, 
        event: toEvent(event), 
        payload: payload, 
        threadId: "",
        onlyRequestWhenWaitedFor: true
    };
}