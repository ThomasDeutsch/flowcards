import { EventKey, EventMap, EventName, FCEvent, toEvent } from './event';
import { combineGuards, getGuardedUnguardedBlocks, GuardFunction } from './guard';
import * as utils from './utils';
import { BThreadDictionary } from './update-loop';

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
    threadId: string;
    event: FCEvent;
    payload?: any;
    guard?: GuardFunction;
}

export type BidByEventNameAndKey = Record<EventName, Record<EventKey, Bid>>;
export type AllBidsByEventNameAndKey = Record<EventName, Record<EventKey, Bid[]>>;
export type BidsForBidType = EventMap<Bid[]> | undefined;
export interface PendingEventInfo {
    event: FCEvent;
    host: string;
    isExtend: boolean;
    actionIndex: number | null;
}

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export interface BThreadBids {
    withMultipleBids?: boolean;
    [BidType.request]?: EventMap<Bid>;
    [BidType.wait]?: EventMap<Bid>;
    [BidType.block]?: EventMap<Bid>;
    [BidType.extend]?: EventMap<Bid>;
}

export function getBidsForBThread(threadId: string, bidOrBids: Bid | undefined | (Bid | undefined)[], pendingEvents: EventMap<PendingEventInfo>): BThreadBids | undefined {
    if(!bidOrBids) return undefined;
    const bids = utils.toArray(bidOrBids).filter(utils.notUndefined).filter(bid => !pendingEvents.has(bid.event));
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

function mergeMaps(maps: (EventMap<Bid> | undefined)[], blocks?: Set<FCEvent>, guardedBlocks?: EventMap<GuardFunction>): EventMap<Bid[]> | undefined {
    if(maps.length === 0) return undefined
    const result = new EventMap<Bid[]>();
    maps.map(r => r?.forEach((event, valueCurr) => {
        result.set(event, [...(result.get(event) || []), valueCurr]);        
    }));
    if(result.size() > 0) {
        if(blocks) blocks.forEach(event => result.delete(event));
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

export function getAllPendingEvents(BThreadDictionary: BThreadDictionary): EventMap<PendingEventInfo>  {
    return Object.keys(BThreadDictionary).reduce((acc: EventMap<PendingEventInfo>, key) => acc.merge(BThreadDictionary[key].state.pendingEvents), new EventMap<PendingEventInfo>());
}

export function getAllBids(allBThreadBids: BThreadBids[]): AllBidsByType {
    const blocks = mergeMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.block]));
    const [fixedBlocks, guardedBlocks] = getGuardedUnguardedBlocks(blocks);
    return {
        [BidType.block]: blocks,
        [BidType.request]: mergeMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.request]), fixedBlocks, guardedBlocks),
        [BidType.wait]: mergeMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.wait]), fixedBlocks, guardedBlocks),
        [BidType.extend]: mergeMaps(allBThreadBids.map(bidsByType => bidsByType[BidType.extend]), fixedBlocks, guardedBlocks)
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

export function extend(event: string | FCEvent, guard?: GuardFunction | null): Bid {
    return { 
        type: BidType.extend,
        subType: BidSubType.none, 
        event: toEvent(event), 
        guard: guard !== null ? guard : undefined, 
        threadId: ""
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