/* eslint-disable @typescript-eslint/no-explicit-any */
import * as utils from "./utils";
import { EventMap, reduceEventMaps, EventKey, toEvent, EventName, FCEvent } from "./event";

export enum BidType {
    request = "request",
    wait = "wait",
    block = "block",
    intercept = "intercept", 
    pending = "pending"
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

export interface BThreadBids {
    withMultipleBids?: boolean;
    [BidType.pending]?: EventMap<Bid>;
    [BidType.request]?: EventMap<Bid>;
    [BidType.wait]?: EventMap<Bid>;
    [BidType.block]?: EventMap<Bid>;
    [BidType.intercept]?: EventMap<Bid>;
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
            const type = bid.type;
            if(!acc[type]) acc[type] = new EventMap();
            acc[type]!.set(bid.event, {...bid, threadId: threadId});
        }
        return acc;
    }, defaultBidsByType);
}

// Bids from multiple threads
// --------------------------------------------------------------------------------------------------------------------
function bidsForType(type: BidType, allBidsByType: BThreadBids[]): EventMap<Bid>[] {
    return allBidsByType.map(bidsByType => bidsByType[type]).filter(utils.notUndefined);
}

function reduceMaps(allBidsForType: (EventMap<Bid> | undefined)[], blocks?: EventMap<Bid[]>): EventMap<Bid[]> | undefined {
    const reduced = reduceEventMaps(allBidsForType, (acc: Bid[] = [], curr: Bid) => [...acc, curr]);
    return reduced?.difference(blocks);
}

export interface AllBidsByType {
    [BidType.pending]?: EventMap<Bid[]>;
    [BidType.request]?: EventMap<Bid[]>;
    [BidType.wait]?: EventMap<Bid[]>;
    [BidType.intercept]?: EventMap<Bid[]>;
}

export function getAllBids(allBThreadBids: BThreadBids[]): AllBidsByType {;
    const pending = reduceMaps(bidsForType(BidType.pending, allBThreadBids));
    const blocks = reduceMaps(bidsForType(BidType.block, allBThreadBids));
    const pendingAndBlocks = reduceEventMaps([blocks, pending], (acc: Bid[] = [], curr: Bid[]) => [...acc, ...curr]);
    return {
        [BidType.pending]: pending,
        [BidType.request]: reduceMaps(bidsForType(BidType.request, allBThreadBids), pendingAndBlocks),
        [BidType.wait]: reduceMaps(bidsForType(BidType.wait, allBThreadBids), blocks),
        [BidType.intercept]: reduceMaps(bidsForType(BidType.intercept, allBThreadBids), blocks)
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
    return { type: BidType.wait, event: toEvent(event), guard: guard, threadId: "" };
}

export function block(event: string | FCEvent): Bid {
    return { type: BidType.block, event: toEvent(event), threadId: "" };
}

export function intercept(event: string | FCEvent, guard?: GuardFunction | null, payload?: any): Bid {
    return { type: BidType.intercept, event: toEvent(event), guard: guard !== null ? guard : undefined, threadId: "", payload: payload };
}