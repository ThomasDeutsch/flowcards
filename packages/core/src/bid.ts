/* eslint-disable @typescript-eslint/no-explicit-any */
import * as utils from "./utils";
import { BThreadBids } from "./bthread";
import { EventMap, reduceEventMaps, EventKey, toEvent, EventName, FCEvent } from "./event";

export enum BidType {
    request = "request",
    wait = "wait",
    block = "block",
    intercept = "intercept"
}

export type GuardFunction = (payload: any) => boolean

export interface Bid {
    type: BidType;
    threadId: string;
    event: FCEvent;
    payload?: any;
    guard?: GuardFunction;
}


export type BidByEventNameAndKey = Record<EventName, Record<EventKey, Bid>>;
export type AllBidsByEventNameAndKey = Record<EventName, Record<EventKey, Bid[]>>;
export type BidsForBidType = EventMap<Bid[]> | undefined;

// Bids from current thread
// --------------------------------------------------------------------------------------------------------------------

export interface BidsByType {
    withMultipleBids: boolean;
    [BidType.request]?: EventMap<Bid>;
    [BidType.wait]?: EventMap<Bid>;
    [BidType.block]?: EventMap<Bid>;
    [BidType.intercept]?: EventMap<Bid>;
}

export function getBidsForBThread(threadId: string, bidOrBids: Bid | undefined | (Bid | undefined)[]): BidsByType | undefined {
    if(!bidOrBids) return undefined;
    const bids = utils.toArray(bidOrBids).filter(utils.notUndefined);
    const defaultBidsByType = {
        withMultipleBids: Array.isArray(bidOrBids)
    }
    if(bids.length === 0) return defaultBidsByType;
    return bids.reduce((acc: BidsByType, bid: Bid | undefined): BidsByType => {
        if(bid) {
            const type = bid.type;
            if(!acc[type]) acc[type] = new EventMap();
            acc[type]!.set(bid.event, {...bid, threadId: threadId});
        }
        return acc;
    }, defaultBidsByType);
}

// Bids from multiple threads
// --------------------------------------------------------------------------------------------------------------------
function bidsForType(type: BidType, allBidsByType: BidsByType[]): EventMap<Bid>[] {
    return allBidsByType.map(bidsByType => bidsByType[type]).filter(utils.notUndefined);
}

function reduceMaps(allBidsForType: EventMap<Bid>[], blocks: EventMap<boolean>): EventMap<Bid[]> {
    const reduced = reduceEventMaps(allBidsForType, (acc: Bid[], curr: Bid) => [...acc, curr], []);
    return reduced.difference(blocks);
}

function reduceBlocks(allBlocks: EventMap<Bid>[]): EventMap<boolean> {
    // todo: merge bid guards when they are added
    return reduceEventMaps(allBlocks, (acc: boolean, curr: Bid) => !!curr, true);
}


export interface AllBidsByType {
    pendingEvents: EventMap<boolean>;
    [BidType.request]?: EventMap<Bid[]>;
    [BidType.wait]?: EventMap<Bid[]>;
    [BidType.intercept]?: EventMap<Bid[]>;
}

export function getAllBids(allBThreadBids: BThreadBids[]): AllBidsByType {
    const bidsByTypes = allBThreadBids.map(x => x.bidsByType).filter(utils.notUndefined);
    const allPendingEvents = reduceEventMaps(allBThreadBids.map(x => x.pendingEvents).filter(utils.notUndefined), () => true, true);
    const blocks = reduceBlocks(bidsForType(BidType.block, bidsByTypes));
    const pendingAndBlocks = reduceEventMaps([blocks, allPendingEvents], () => true, true);
    return {
        pendingEvents: allPendingEvents,
        [BidType.request]: reduceMaps(bidsForType(BidType.request, bidsByTypes), pendingAndBlocks),
        [BidType.wait]: reduceMaps(bidsForType(BidType.wait, bidsByTypes), blocks),
        [BidType.intercept]: reduceMaps(bidsForType(BidType.intercept, bidsByTypes), blocks)
    };
}

export function getMatchingBids(bids?: EventMap<Bid[]>, event?: FCEvent): Bid[] | undefined {
    if(bids === undefined) return undefined
    const result = bids.getAllMatchingItems(event);
    if(result === undefined) return result;
    return utils.flattenShallow(result);
}

// Bid API --------------------------------------------------------------------

export function request(event: string | FCEvent, payload?: any): Bid {
    return { type: BidType.request, event: toEvent(event), payload: payload, threadId: "" };
}

export function wait(event: string | FCEvent, guard?: GuardFunction): Bid {
    return { type: BidType.wait, event: toEvent(event), guard: guard, threadId: ""};
}

export function block(event: string | FCEvent): Bid {
    return { type: BidType.block, event: toEvent(event), threadId: "" };
}

export function intercept(event: string | FCEvent, guard?: GuardFunction | null, payload?: any, ): Bid {
    return { type: BidType.intercept, event: toEvent(event), guard: guard !== null ? guard : undefined, threadId: "", payload: payload};
}