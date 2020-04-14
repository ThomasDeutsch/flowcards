/* eslint-disable @typescript-eslint/no-explicit-any */
import * as utils from "./utils";
import { BThreadBids } from "./bthread";

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
    withMultipleBids: boolean;
    [BidType.request]: Record<EventName, Bid>;
    [BidType.wait]: Record<EventName, Bid>;
    [BidType.block]: Record<EventName, Bid>;
    [BidType.intercept]: Record<EventName, Bid>;
}

export function getBidsForBThread(threadId: string, bidOrBids: Bid | null | (Bid | null)[]): BidsByType | null {
    if(!bidOrBids) return null;
    const bids = utils.toArray(bidOrBids).filter(utils.notNull);
    const defaultBidsByType = {
        withMultipleBids: Array.isArray(bidOrBids),
        [BidType.request]: {},
        [BidType.wait]: {},
        [BidType.block]: {},
        [BidType.intercept]: {}
    }
    if(bids.length === 0) return defaultBidsByType;
    return bids.reduce((acc: BidsByType, bid: Bid | null): BidsByType => {
        if(bid) {
            acc[bid.type][bid.eventName] = {
                ...bid, 
                threadId: threadId
            };
        }
        return acc;
    }, defaultBidsByType);
}

// Bids from multiple threads
// --------------------------------------------------------------------------------------------------------------------

function getAllBidsForType(type: BidType, coll: BidsByType[], blockedEvents: Set<EventName> | null): BidsForBidType {
    return coll.reduce((acc: BidsForBidType, curr: BidsByType): BidsForBidType => {
        const bidByEventName = curr[type];
        Object.keys(bidByEventName).forEach((eventName): BidsForBidType | undefined => {
            if (blockedEvents && blockedEvents.has(eventName)) return;
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

export function getAllBids(coll: BThreadBids[]): AllBidsByType {
    const bidsByTypes = coll.map((x) => x.bidsByType).filter(utils.notNull);
    const allPendingEvents = utils.union(coll.map(bbt => bbt.pendingEvents).filter(utils.notNull));
    const blocks = new Set(bidsByTypes.map(bidsByType => bidsByType[BidType.block]).map(rec => Object.keys(rec)).reduce((acc, val) => acc.concat(val), []));
    const pendingAndBlocks = blocks ? utils.union([blocks, allPendingEvents]) : allPendingEvents;
    return {
        pendingEvents: allPendingEvents,
        [BidType.request]: getAllBidsForType(BidType.request, bidsByTypes, pendingAndBlocks),
        [BidType.wait]: getAllBidsForType(BidType.wait, bidsByTypes, blocks),
        [BidType.intercept]: getAllBidsForType(BidType.intercept, bidsByTypes, blocks)
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