/* eslint-disable @typescript-eslint/no-explicit-any */
import * as utils from "./utils";

export enum BidType {
    request = "request",
    wait = "wait",
    block = "block",
    intercept = "intercept",
    resolve = "resolve",
    reject = "reject"
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

export type BidArrayDictionary = Record<string, Bid[]>;

export enum BidDictionaryType {
    single = "single",
    array = "array",
    pendingEventsOnly = "pendingEventsOnly"
}

// Bids from current thread
// --------------------------------------------------------------------------------------------------------------------

export interface BidDictionaries {
    type: BidDictionaryType;
    pendingEvents: Set<string>;
    [BidType.request]: Record<string, Bid>;
    [BidType.wait]: Record<string, Bid>;
    [BidType.block]: Record<string, Bid>;
    [BidType.intercept]: Record<string, Bid>;
    [BidType.resolve]: Record<string, Bid>;
    [BidType.reject]: Record<string, Bid>;
}


export function getBidDictionaries(threadId: string, bid: Bid | null | (Bid | null)[], pendingEvents: Set<string>): BidDictionaries | null {
    if(!bid && pendingEvents.size === 0) return null;
    const bd = {
        type: BidDictionaryType.pendingEventsOnly,
        [BidType.request]: {},
        [BidType.wait]: {},
        [BidType.block]: {},
        [BidType.intercept]: {},
        [BidType.resolve]: {},
        [BidType.reject]: {},
        pendingEvents: pendingEvents
    }
    if(!bid) return bd;
    const rec = {...bd, type: BidDictionaryType.array}
    if(Array.isArray(bid)) {
        rec.type = BidDictionaryType.array;
    } else {
        rec.type = BidDictionaryType.single;
        bid = [bid];
    }
    return bid.reduce((acc: BidDictionaries, b): BidDictionaries => {
        if(b) {
            let type = b.type;
            acc[type][b.eventName] = {
                ...b, 
                threadId: threadId
            };
        }
        return acc;
    }, rec);
}

// Bids from multiple threads
// --------------------------------------------------------------------------------------------------------------------

function getAllBidsForType(
    type: BidType,
    coll: BidDictionaries[],
    blockedEventNames: Set<string> | null,
    guardedBlocks: Record<string, Function> | null
): BidArrayDictionary {
    return coll.reduce((acc: BidArrayDictionary, curr: BidDictionaries): BidArrayDictionary => {
        const bidByEventName = curr[type];
        Object.keys(bidByEventName).forEach((eventName): BidArrayDictionary | undefined => {
            if (blockedEventNames && blockedEventNames.has(eventName)) {
                return acc;
            }
            const bid = {...bidByEventName[eventName]}
            if(guardedBlocks && guardedBlocks[eventName]) {
                bid.guard = bid.guard ? (a: any): boolean => (!!bid.guard && bid.guard(a) && !guardedBlocks[eventName](a)) : (a: any): boolean => !guardedBlocks[eventName](a);
            }
            if (acc[eventName]) {
                acc[eventName].push(bid);
            } else {
                acc[eventName] = [bid];
            }
        });
        return acc;
    }, {});
}

function getCategorizedBlocks(blocks: BidArrayDictionary): [Record<string,Function>, Set<string> | null] {
    const guarded: Record<string, Function> = {};
    const unguarded: Set<string> = new Set();
    Object.keys(blocks).forEach((eventName: string): void => {
        blocks[eventName].forEach((block): void => {
            if(block.guard && !unguarded.has(eventName)) {
                if(guarded[eventName]) {
                    guarded[eventName] = (a: any): boolean => block.guard && !block.guard(a) || !guarded[eventName](a);
                }
                else {
                    guarded[eventName] = block.guard;
                }
            }
            if(!block.guard) {
                delete guarded[eventName];
                unguarded.add(eventName);
            }
        })
    });
    return [guarded, (unguarded.size === 0) ? null : unguarded];
}

export interface BidDictionariesByType {
    pendingEvents: Set<string>;
    [BidType.request]: BidArrayDictionary;
    [BidType.wait]: BidArrayDictionary;
    [BidType.intercept]: BidArrayDictionary;
    [BidType.resolve]: BidArrayDictionary;
    [BidType.reject]: BidArrayDictionary;
}

export function getAllBids(coll: (BidDictionaries | null)[]): BidDictionariesByType {
    const dictionaries = coll.filter((c): c is BidDictionaries => c !== null);
    const allPendingEvents =  utils.union(dictionaries.map(bd => bd.pendingEvents));
    const allBlockingBids = getAllBidsForType(BidType.block, dictionaries, null, null);
    const [guardedBlocks, unguardedBlocks] = getCategorizedBlocks(allBlockingBids);
    const allPendingAndUnguardedBlocks = unguardedBlocks ? utils.union([unguardedBlocks, allPendingEvents]) : allPendingEvents;
    return {
        pendingEvents: allPendingEvents,
        [BidType.request]: getAllBidsForType(BidType.request, dictionaries, allPendingAndUnguardedBlocks, guardedBlocks),
        [BidType.wait]: getAllBidsForType(BidType.wait, dictionaries, allPendingAndUnguardedBlocks, guardedBlocks),
        [BidType.intercept]: getAllBidsForType(BidType.intercept, dictionaries, allPendingAndUnguardedBlocks, guardedBlocks),
        [BidType.resolve]: getAllBidsForType(BidType.resolve, dictionaries, unguardedBlocks, guardedBlocks),
        [BidType.reject]: getAllBidsForType(BidType.reject, dictionaries, unguardedBlocks, guardedBlocks)
    };
}


// Bid API --------------------------------------------------------------------

export function request(eventName: string, payload?: any): Bid {
    return { type: BidType.request, eventName: eventName, payload: payload, threadId: "" };
}

export function wait(eventName: string, guard?: GuardFunction): Bid {
    return { type: BidType.wait, eventName: eventName, guard: guard, threadId: ""};
}

export function block(eventName: string, guard?: GuardFunction): Bid {
    return { type: BidType.block, eventName: eventName, guard: guard, threadId: "" };
}

export function intercept(eventName: string, guard?: GuardFunction): Bid {
    return { type: BidType.intercept, eventName: eventName, guard: guard, threadId: ""};
}

export function resolve(eventName: string, payload?: any): Bid {
    return { type: BidType.resolve, eventName: eventName, payload: payload, threadId: ""};
}

export function reject(eventName: string): Bid {
    return { type: BidType.reject, eventName: eventName, threadId: ""};
}