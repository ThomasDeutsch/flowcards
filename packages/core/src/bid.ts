import { EventKey, EventMap, EventId, toEvent } from './event-map';
import { combineGuards, getGuardedUnguardedBlocks, GuardFunction } from './guard';
import * as utils from './utils';
import { PendingEventInfo, BThreadId } from './bthread';

export enum BidType {
    request = "request",
    wait = "wait",
    block = "block",
    extend = "extend"
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
    bThreadId: BThreadId;
    event: EventId;
    payload?: any;
    guard?: GuardFunction;
}

export type BidByEventNameAndKey = Record<string, Record<EventKey, Bid>>;
export type AllBidsByEventNameAndKey = Record<string, Record<EventKey, Bid[]>>;


// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export interface BThreadBids {
    withMultipleBids?: boolean;
    [BidType.request]?: EventMap<Bid>;
    [BidType.wait]?: EventMap<Bid>;
    [BidType.block]?: EventMap<Bid>;
    [BidType.extend]?: EventMap<Bid>;
}

export function getBidsForBThread(bThreadId: BThreadId, bidOrBids: Bid | undefined | (Bid | undefined)[], pendingEvents: EventMap<PendingEventInfo>): BThreadBids | undefined {
    if(!bidOrBids) return undefined;
    const bids = utils.toArray(bidOrBids).filter(bid => bid !== undefined && bid !== null && !pendingEvents.has(bid.event));
    const defaultBidsByType = {
        withMultipleBids: Array.isArray(bidOrBids)
    }
    if(bids.length === 0) return defaultBidsByType;
    return bids.reduce((acc: BThreadBids, bid: Bid | undefined): BThreadBids => {
        if(bid) {
            if(!acc[bid.type]) {
                acc[bid.type] = new EventMap();
            }
            acc[bid.type]!.set(bid.event, {...bid, bThreadId: bThreadId});
        }
        return acc;
    }, defaultBidsByType);
}

// bids from multiple BThreads
// --------------------------------------------------------------------------------------------------------------------

function mergeMaps(maps: (EventMap<Bid> | undefined)[], blocks?: EventMap<true>, guardedBlocks?: EventMap<GuardFunction>): EventMap<Bid[]> | undefined {
    if(maps.length === 0) return undefined
    const result = new EventMap<Bid[]>();
    maps.map(r => r?.forEach((event, valueCurr) => {
        result.set(event, [...(result.get(event) || []), valueCurr]);        
    }));
    if(result.size() > 0) {
        result.deleteMatching(blocks);
        if(guardedBlocks) combineGuards(result, guardedBlocks);
    }
    return result;
}

export interface AllBidsByType {
    [BidType.request]?: EventMap<Bid[]>;
    [BidType.wait]?: EventMap<Bid[]>;
    [BidType.extend]?: EventMap<Bid[]>;
    [BidType.block]?: EventMap<Bid[]>;
}

export function getAllBids(allBThreadBids: BThreadBids[], allPending: EventMap<PendingEventInfo>): AllBidsByType {
    const blocks = mergeMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.block]));
    const [fixedBlocks, guardedBlocks] = getGuardedUnguardedBlocks(blocks);
    const fixedBlocksAndPending = fixedBlocks?.clone() || new EventMap<true>();
    allPending.forEach((event) => fixedBlocksAndPending.set(event, true));
    return {
        [BidType.request]: mergeMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.request]), fixedBlocksAndPending, guardedBlocks),
        [BidType.wait]: mergeMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.wait]), fixedBlocks, guardedBlocks),
        [BidType.extend]: mergeMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.extend]), fixedBlocks, guardedBlocks),
        [BidType.block]: blocks
    };
}

export function getMatchingBids(bids?: EventMap<Bid[]>, event?: EventId): Bid[] | undefined {
    if(bids === undefined) return undefined
    const result = bids.getAllMatchingValues(event);
    if(result === undefined) return undefined;
    return utils.flattenShallow(result);
}


// bids user-API --------------------------------------------------------------------

export function request(event: string | EventId, payload?: any): Bid {
    return {
        type: BidType.request,
        subType: BidSubType.none,
        event: toEvent(event), 
        payload: payload, 
        bThreadId: {name: ""}
    };
}

export function wait(event: string | EventId, guard?: GuardFunction): Bid {
    return { 
        type: BidType.wait,
        subType: BidSubType.none,
        event: toEvent(event), 
        guard: guard,
        bThreadId: {name: ""}
    };
}

export function block(event: string | EventId, guard?: GuardFunction): Bid {
    return { 
        type: BidType.block,
        subType: BidSubType.none,
        event: toEvent(event), 
        guard: guard, 
        bThreadId: {name: ""}
    };
}

export function set(event: string | EventId, payload?: any): Bid {
    return {
        type: BidType.request,
        subType: BidSubType.set,
        event: toEvent(event), 
        payload: payload,
        bThreadId: {name: ""}
    };
}

export function extend(event: string | EventId, guard?: GuardFunction | null): Bid {
    return { 
        type: BidType.extend,
        subType: BidSubType.none, 
        event: toEvent(event), 
        guard: guard !== null ? guard : undefined, 
        bThreadId: {name: ""}
    };
}

export function on(event: string | EventId, guard?: GuardFunction): Bid {
    return { 
        type: BidType.wait,
        subType: BidSubType.on,
        event: toEvent(event), 
        guard: guard,
        bThreadId: {name: ""}
    };
}

export function onPending(event: string | EventId): Bid {
    return { 
        type: BidType.wait,
        subType: BidSubType.onPending,
        event: toEvent(event),
        bThreadId: {name: ""}
    };
}

export function trigger(event: string | EventId, payload?: any): Bid {
    return {
        type: BidType.request,
        subType: BidSubType.trigger,
        event: toEvent(event), 
        payload: payload,
        bThreadId: {name: ""}
    };
}