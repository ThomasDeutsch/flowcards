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

export enum BidSubType {
    none = "none",
    trigger = "trigger",
    set = "set",
    on = "on",
    onPending = "onPending"
}

export interface Bid {
    type: BidType;
    subType: BidSubType;
    threadId: string;
    event: FCEvent;
    payload?: any;
    guard?: GuardFunction;
}

export type BidByEventNameAndKey = Record<EventName, Record<EventKey, Bid>>;
export type AllBidsByEventNameAndKey = Record<EventName, Record<EventKey, Bid[]>>;
export type BidsForBidType = EventMap<Bid[]> | undefined;

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export interface BThreadBids {
    withMultipleBids?: boolean;
    [BidType.pending]?: EventMap<true>;
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
        if(bid && bid.type !== BidType.pending) {
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

function reduceMaps(allBidsForType: (EventMap<Bid> | undefined)[], blocks?: Set<FCEvent>, guardedBlocks?: EventMap<GuardFunction>): EventMap<Bid[]> | undefined {
    const reduced = reduceEventMaps(allBidsForType, (acc: Bid[] = [], curr: Bid) => [...acc, curr]);
    if(blocks && reduced) blocks.forEach(event => reduced.delete(event));
    if(guardedBlocks && reduced) combineGuards(reduced, guardedBlocks);
    return reduced;
}

export interface AllBidsByType {
    [BidType.pending]?: Set<FCEvent>;
    [BidType.request]?: EventMap<Bid[]>;
    [BidType.wait]?: EventMap<Bid[]>;
    [BidType.extend]?: EventMap<Bid[]>;
}

export function getAllBids(allBThreadBids: BThreadBids[]): AllBidsByType {
    const pending = allBThreadBids.reduce((acc: FCEvent[], bids) => {
        if(bids[BidType.pending]) acc = [...acc, ...(bids[BidType.pending]?.allEvents || [])]
        return acc;
    }, []);
    const pendingEvents = new Set(pending);
    const blocks = reduceMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.block]).filter(utils.notUndefined));
    const [fixedBlocks, guardedBlocks] = getGuardedUnguardedBlocks(blocks);
    const fixedBlocksAndPending = utils.union(pendingEvents, fixedBlocks);
    return {
        [BidType.pending]: pendingEvents,
        [BidType.request]: reduceMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.request]).filter(utils.notUndefined), fixedBlocksAndPending, guardedBlocks),
        [BidType.wait]: reduceMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.wait]).filter(utils.notUndefined), fixedBlocks, guardedBlocks),
        [BidType.extend]: reduceMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.extend]).filter(utils.notUndefined), fixedBlocks, guardedBlocks)
    };
}

export function getMatchingBids(bids?: EventMap<Bid[]>, event?: FCEvent): Bid[] | undefined {
    if(bids === undefined) return undefined
    const result = bids.getAllMatchingValues(event);
    if(result === undefined) return undefined;
    return utils.flattenShallow(result);
}


// bids user-API --------------------------------------------------------------------

export function request(event: string | FCEvent, payload?: any): Bid {
    return {
        type: BidType.request,
        subType: BidSubType.none,
        event: toEvent(event), 
        payload: payload, 
        threadId: ""
    };
}

export function wait(event: string | FCEvent, guard?: GuardFunction): Bid {
    return { 
        type: BidType.wait,
        subType: BidSubType.none,
        event: toEvent(event), 
        guard: guard,
        threadId: "" 
    };
}

export function block(event: string | FCEvent, guard?: GuardFunction): Bid {
    return { 
        type: BidType.block,
        subType: BidSubType.none,
        event: toEvent(event), 
        guard: guard, 
        threadId: ""
    };
}

export function set(event: string | FCEvent, payload?: any): Bid {
    return {
        type: BidType.request,
        subType: BidSubType.set,
        event: toEvent(event), 
        payload: payload,
        threadId: ""
    };
}

export function extend(event: string | FCEvent, guard?: GuardFunction | null, payload?: any): Bid {
    return { 
        type: BidType.extend,
        subType: BidSubType.none, 
        event: toEvent(event), 
        guard: guard !== null ? guard : undefined, 
        threadId: "", 
        payload: payload
    };
}

export function on(event: string | FCEvent, guard?: GuardFunction): Bid {
    return { 
        type: BidType.wait,
        subType: BidSubType.on,
        event: toEvent(event), 
        guard: guard,
        threadId: "" 
    };
}

export function onPending(event: string | FCEvent): Bid {
    return { 
        type: BidType.wait,
        subType: BidSubType.onPending,
        event: toEvent(event),
        threadId: "" 
    };
}

export function trigger(event: string | FCEvent, payload?: any): Bid {
    return {
        type: BidType.request,
        subType: BidSubType.trigger,
        event: toEvent(event), 
        payload: payload,
        threadId: ""
    };
}