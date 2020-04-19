/* eslint-disable @typescript-eslint/no-explicit-any */
import * as utils from "./utils";
import { BThreadBids } from "./bthread";

export enum BidType {
    request = "request",
    wait = "wait",
    block = "block",
    intercept = "intercept"
}

export type eventId = string;
export interface EventBaseObj {
    id: string;
    key?: string | number;
}

export type GuardFunction = (payload: any) => boolean

export interface Bid {
    type: BidType;
    threadId: string;
    event: EventBaseObj;
    payload?: any;
    guard?: GuardFunction;
}

export type BidsForBidType = Record<eventId, Bid[]>;

// Bids from current thread
// --------------------------------------------------------------------------------------------------------------------

export interface BidsByType {
    withMultipleBids: boolean;
    [BidType.request]: Record<eventId, Bid>;
    [BidType.wait]: Record<eventId, Bid>;
    [BidType.block]: Record<eventId, Bid>;
    [BidType.intercept]: Record<eventId, Bid>;
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
            acc[bid.type][bid.event.id] = {
                ...bid, 
                threadId: threadId
            };
        }
        return acc;
    }, defaultBidsByType);
}

// Bids from multiple threads
// --------------------------------------------------------------------------------------------------------------------

function getAllBidsForType(type: BidType, coll: BidsByType[], blockedEvents: Set<eventId> | null): BidsForBidType {
    return coll.reduce((acc: BidsForBidType, curr: BidsByType): BidsForBidType => {
        const bidByeventId = curr[type];
        Object.keys(bidByeventId).forEach((eventId): BidsForBidType | undefined => {
            if (blockedEvents && blockedEvents.has(eventId)) return;
            const bid = {...bidByeventId[eventId]}
            if (acc[eventId]) {
                acc[eventId].push(bid);
            } else {
                acc[eventId] = [bid];
            }
        });
        return acc;
    }, {});
}

export interface AllBidsByType {
    pendingEvents: Set<eventId>;
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

function toEventBaseObj(e: string | EventBaseObj): EventBaseObj {
    return (typeof e === 'string') ? {id: e} : e;
}

// Bid API --------------------------------------------------------------------

export function request(eventId: string, payload?: any): Bid {
    return { type: BidType.request, event: {id: eventId}, payload: payload, threadId: "" };
}

export function wait(event: string | EventBaseObj, guard?: GuardFunction): Bid {

    return { type: BidType.wait, event: toEventBaseObj(event), guard: guard, threadId: ""};
}

export function block(event: string | EventBaseObj): Bid {
    return { type: BidType.block, event: toEventBaseObj(event), threadId: "" };
}

export function intercept(event: string | EventBaseObj, guard?: GuardFunction): Bid {
    return { type: BidType.intercept, event: toEventBaseObj(event), guard: guard, threadId: ""};
}