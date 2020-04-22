/* eslint-disable @typescript-eslint/no-explicit-any */
import * as utils from "./utils";
import { BThreadBids } from "./bthread";
import { EventKeyRecord, reduceEventKeyRecords, EventKey } from "./event";

export enum BidType {
    request = "request",
    wait = "wait",
    block = "block",
    intercept = "intercept"
}

export type EventName = string;
export type EventNameAndKey = string
export interface Event {
    name: string;
    key: string;
}

export type GuardFunction = (payload: any) => boolean

export interface Bid {
    type: BidType;
    threadId: string;
    event: Event;
    payload?: any;
    guard?: GuardFunction;
}


export type BidByEventNameAndKey = Record<EventName, Record<EventKey, Bid>>;
export type AllBidsByEventNameAndKey = Record<EventName, Record<EventKey, Bid[]>>;
export type BidsForBidType = EventKeyRecord<Bid[]> | null

// Bids from current thread
// --------------------------------------------------------------------------------------------------------------------

export interface BidsByType {
    withMultipleBids: boolean;
    [BidType.request]: EventKeyRecord<Bid> | null;
    [BidType.wait]: EventKeyRecord<Bid> | null;
    [BidType.block]: EventKeyRecord<Bid> | null;
    [BidType.intercept]: EventKeyRecord<Bid> | null;
}

export function getBidsForBThread(threadId: string, bidOrBids: Bid | null | (Bid | null)[]): BidsByType | null {
    if(!bidOrBids) return null;
    const bids = utils.toArray(bidOrBids).filter(utils.notNull);
    const defaultBidsByType = {
        withMultipleBids: Array.isArray(bidOrBids),
        [BidType.request]: null,
        [BidType.wait]: null,
        [BidType.block]: null,
        [BidType.intercept]: null
    }
    if(bids.length === 0) return defaultBidsByType;
    return bids.reduce((acc: BidsByType, bid: Bid | null): BidsByType => {
        if(bid) {
            const type = bid.type;
            if(acc[type] === null) acc[type] = new EventKeyRecord();
            acc[type]!.add(bid.event, {...bid, threadId: threadId});
        }
        return acc;
    }, defaultBidsByType);
}

// Bids from multiple threads
// --------------------------------------------------------------------------------------------------------------------
function bidsForType(type: BidType, allBidsByType: BidsByType[]): EventKeyRecord<Bid>[] {
    return allBidsByType.map(bidsByType => bidsByType[type]).filter(utils.notNull);
}

function reduceBidsForType(allBidsForType: EventKeyRecord<Bid>[], blocks: EventKeyRecord<boolean>): EventKeyRecord<Bid[]> {
    const reducer = (acc: Bid[] = [], curr: Bid) => blocks.get(curr.event) ? acc : [...acc, curr];
    return reduceEventKeyRecords(allBidsForType, reducer);
}

function reduceBlocks(allBlocks: EventKeyRecord<Bid>[]): EventKeyRecord<true> {
    // todo: merge bid guards when they are added
    return reduceEventKeyRecords(allBlocks, (acc: true, curr: Bid) => !!curr);
}

export interface AllBidsByType {
    pendingEvents: EventKeyRecord<boolean>;
    [BidType.request]: EventKeyRecord<Bid[]>;
    [BidType.wait]: EventKeyRecord<Bid[]>;
    [BidType.intercept]: EventKeyRecord<Bid[]>;
}

export function getAllBids(allBThreadBids: BThreadBids[]): AllBidsByType {
    const bidsByTypes = allBThreadBids.map(x => x.bidsByType).filter(utils.notNull);
    const allPendingEvents = reduceEventKeyRecords(allBThreadBids.map(x => x.pendingEvents).filter(utils.notNull), () => true);
    const blocks = reduceBlocks(bidsForType(BidType.block, bidsByTypes));
    const pendingAndBlocks = reduceEventKeyRecords([blocks, allPendingEvents], () => true);
    return {
        pendingEvents: allPendingEvents,
        [BidType.request]: reduceBidsForType(bidsForType(BidType.request, bidsByTypes), pendingAndBlocks),
        [BidType.wait]: reduceBidsForType(bidsForType(BidType.wait, bidsByTypes), blocks),
        [BidType.intercept]: reduceBidsForType(bidsForType(BidType.intercept, bidsByTypes), blocks)
    };
}

function toEvent(e: string | Event): Event {
    const te = (typeof e === 'string') ? {name: e} : e;
    return {key: '__NOKEY_', ...te};
}

// Bid API --------------------------------------------------------------------

export function request(event: string | Event, payload?: any): Bid {
    return { type: BidType.request, event: toEvent(event), payload: payload, threadId: "" };
}

export function wait(event: string | Event, guard?: GuardFunction): Bid {

    return { type: BidType.wait, event: toEvent(event), guard: guard, threadId: ""};
}

export function block(event: string | Event): Bid {
    return { type: BidType.block, event: toEvent(event), threadId: "" };
}

export function intercept(event: string | Event, guard?: GuardFunction): Bid {
    return { type: BidType.intercept, event: toEvent(event), guard: guard, threadId: ""};
}