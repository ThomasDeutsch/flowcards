/* eslint-disable @typescript-eslint/no-explicit-any */
import * as utils from "./utils";

export enum BidType {
    request = "request",
    wait = "wait",
    block = "block",
    intercept = "intercept"
}

export type EventName = string;
export type GuardFunction = (payload: any) => boolean

export interface Bid {
    type: BidType;
    threadId: string;
    eventName: EventName;
    payload?: any;
    guard?: GuardFunction;
}

export type BidsForBidType = Record<EventName, Bid[]>;

// Bids from current thread
// --------------------------------------------------------------------------------------------------------------------

export interface BidsByType {
    pendingEvents: Set<EventName>;
    [BidType.request]: Record<EventName, Bid>;
    [BidType.wait]: Record<EventName, Bid>;
    [BidType.block]: Record<EventName, Bid>;
    [BidType.intercept]: Record<EventName, Bid>;
}

export interface BidsForThread {
    withMultipleBids: boolean;
    bidsByType: BidsByType;
}

export function getBidsForThread(threadId: string, bidOrBids: Bid | null | (Bid | null)[], pendingEvents: Set<EventName>): BidsForThread | null {
    if(!bidOrBids && pendingEvents.size === 0) return null;
    const withMultipleBids = Array.isArray(bidOrBids);
    const bids = utils.toArray(bidOrBids).filter(utils.notNull);
    const defaultBidsByType = {
        pendingEvents: pendingEvents,
        [BidType.request]: {},
        [BidType.wait]: {},
        [BidType.block]: {},
        [BidType.intercept]: {}
    }
    if(bids.length === 0) return {
        withMultipleBids: withMultipleBids,
        bidsByType: defaultBidsByType
    }
    const bidsByType = bids.reduce((acc: BidsByType, bid: Bid | null): BidsByType => {
        if(bid) {
            acc[bid.type][bid.eventName] = {
                ...bid, 
                threadId: threadId
            };
        }
        return acc;
    }, defaultBidsByType);
    return {
        withMultipleBids: withMultipleBids,
        bidsByType: bidsByType
    }
    
}

// Bids from multiple threads
// --------------------------------------------------------------------------------------------------------------------

function getAllBidsForType(type: BidType, coll: BidsByType[], blockedEvents: Set<EventName> | null): BidsForBidType {
    return coll.reduce((acc: BidsForBidType, curr: BidsByType): BidsForBidType => {
        const bidByEventName = curr[type];
        Object.keys(bidByEventName).forEach((eventName): BidsForBidType | undefined => {
            if (blockedEvents && blockedEvents.has(eventName)) {
                return acc;
            }
            const bid = {...bidByEventName[eventName]}
            if (acc[eventName]) {
                acc[eventName].push(bid);
            } else {
                acc[eventName] = [bid];
            }
        });
        return acc;
    }, {});
}

export interface AllBidsByType {
    pendingEvents: Set<EventName>;
    [BidType.request]: BidsForBidType;
    [BidType.wait]: BidsForBidType;
    [BidType.intercept]: BidsForBidType;
}

export function getAllBids(coll: (BidsByType | null)[]): AllBidsByType {
    const bbts = coll.filter(utils.notNull);
    const allPendingEvents =  utils.union(bbts.map(bbt => bbt.pendingEvents));
    const blocks = new Set(...bbts.map(bbt => bbt[BidType.block]).map(rec => Object.keys(rec)));
    const pendingAndBlocks = blocks ? utils.union([blocks, allPendingEvents]) : allPendingEvents;
    return {
        pendingEvents: allPendingEvents,
        [BidType.request]: getAllBidsForType(BidType.request, bbts, pendingAndBlocks),
        [BidType.wait]: getAllBidsForType(BidType.wait, bbts, blocks),
        [BidType.intercept]: getAllBidsForType(BidType.intercept, bbts, pendingAndBlocks)
    };
}


// Bid API --------------------------------------------------------------------

export function request(eventName: string, payload?: any): Bid {
    return { type: BidType.request, eventName: eventName, payload: payload, threadId: "" };
}

export function wait(eventName: string, guard?: GuardFunction): Bid {
    return { type: BidType.wait, eventName: eventName, guard: guard, threadId: ""};
}

export function block(eventName: string): Bid {
    return { type: BidType.block, eventName: eventName, threadId: "" };
}

export function intercept(eventName: string, guard?: GuardFunction): Bid {
    return { type: BidType.intercept, eventName: eventName, guard: guard, threadId: ""};
}