/* eslint-disable @typescript-eslint/no-explicit-any */

export enum BidType {
    wait = "wait",
    intercept = "intercept",
    block = "block",
    request = "request"
}

export interface Bid {
    type: BidType;
    threadId: string;
    eventName: string;
    payload?: any;
    guard?: Function;
}

interface Dictionary<T> {
    [Key: string]: T;
}

export type BidArrayDictionary = Dictionary<Bid[]>;

export enum BidDictionaryType {
    single = "single",
    array = "array"
}

// Bids from current thread
// --------------------------------------------------------------------------------------------------------------------

export class BidDictionaries {
    public readonly type: BidDictionaryType;
    public readonly threadId: string;
    public unresolvedBid?: Function;
    public [BidType.wait]: Dictionary<Bid> = {};
    public [BidType.intercept]: Dictionary<Bid> = {};
    public [BidType.request]: Dictionary<Bid> = {};
    public [BidType.block]: Dictionary<Bid> = {};

    public constructor(type: BidDictionaryType, threadId: string, unresolvedBid?: Function) {
        this.type = type;
        this.threadId = threadId;
        this.unresolvedBid = unresolvedBid;
    }

    public addBid(bid: Bid | null): BidDictionaries {
        if(bid) {
            bid.threadId = this.threadId;
            this[bid.type][bid.eventName] = bid;
        }
        return this;
    }

    public clone(): BidDictionaries {
        const c = new BidDictionaries(this.type, this.threadId);
        c[BidType.wait] = { ...this[BidType.wait] };
        c[BidType.request] = { ...this[BidType.request] };
        c[BidType.intercept] = { ...this[BidType.intercept] };
        c[BidType.block] = { ...this[BidType.block] };
        return c;
    }
}

export function getBidDictionaries(threadId: string, bid: Bid | null | (Bid | null)[]): BidDictionaries {
    if (Array.isArray(bid)) {
        return bid.reduce((acc: BidDictionaries, b): BidDictionaries => acc.addBid(b), new BidDictionaries(BidDictionaryType.array, threadId));
    } 
    return new BidDictionaries(BidDictionaryType.single, threadId).addBid(bid);
}

export function getCurrentBids(bds: BidDictionaries | null, pendingEventNames: string[]): BidDictionaries | null {
    if (bds === null) return null;
    if (!pendingEventNames.length) return bds;
    const current = bds.clone(); 
    pendingEventNames.forEach((eventName): void => {
        delete current.request[eventName];
    });
    return current;
}

// Bids from multiple threads
// --------------------------------------------------------------------------------------------------------------------

function getAllBidsForType(
    type: BidType,
    coll: BidDictionaries[],
    blockedEventNames: Set<string> | null,
    guardedBlocks: Dictionary<Function> | null
): BidArrayDictionary {
    return coll.reduce((acc: BidArrayDictionary, curr: BidDictionaries): BidArrayDictionary => {
        const bidByEventName = curr[type];
        Object.keys(bidByEventName).forEach((eventName): BidArrayDictionary | undefined => {
            if (blockedEventNames && blockedEventNames.has(eventName)) {
                return acc;
            }
            const bid = {...bidByEventName[eventName]}
            if(guardedBlocks && guardedBlocks[eventName]) {
                bid.guard = bid.guard ? (a: any): boolean => bid.guard && bid.guard(a) && !guardedBlocks[eventName](a) : (a: any): boolean => !guardedBlocks[eventName](a);
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

function getCategorizedBlocks(blocks: BidArrayDictionary): [Dictionary<Function>, Set<string> | null] {
    const guarded: Dictionary<Function> = {};
    const unguarded: Set<string> = new Set();
    Object.keys(blocks).forEach((eventName: string): void => {
        blocks[eventName].forEach((block): void => {
            if(block.guard && !unguarded.has(eventName)) {
                if(guarded[eventName]) {
                    guarded[eventName] = (a: any): boolean => (block.guard && block.guard(a) && guarded[eventName](a));
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
    [BidType.wait]: BidArrayDictionary;
    [BidType.request]: BidArrayDictionary;
    [BidType.intercept]: BidArrayDictionary;
}

export function getAllBids(coll: (BidDictionaries | null)[]): BidDictionariesByType {
    const dictionaries = coll.filter((c): c is BidDictionaries => c !== null);
    const allBlockingBids = getAllBidsForType(BidType.block, dictionaries, null, null);
    const [guardedBlocks, unguardedBlocks] = getCategorizedBlocks(allBlockingBids);
    return {
        [BidType.wait]: getAllBidsForType(BidType.wait, dictionaries, unguardedBlocks, guardedBlocks), // todo: add guarded blocks and remove guarded blocks 
        [BidType.request]: getAllBidsForType(BidType.request, dictionaries, unguardedBlocks, guardedBlocks),
        [BidType.intercept]: getAllBidsForType(BidType.intercept, dictionaries, unguardedBlocks, guardedBlocks)
    };
}


// Bid API --------------------------------------------------------------------

export function wait(eventName: string, guard?: Function): Bid {
    return { type: BidType.wait, eventName: eventName, guard: guard, threadId: ""};
}

export function intercept(eventName: string, guard?: Function): Bid {
    return { type: BidType.intercept, eventName: eventName, guard: guard, threadId: ""};
}

export function request(eventName: string, payload?: any): Bid {
    return { type: BidType.request, eventName: eventName, payload: payload, threadId: "" };
}

export function block(eventName: string, guard?: Function): Bid {
    return { type: BidType.block, eventName: eventName, guard: guard, threadId: "" };
}

export default {
    wait: wait,
    intercept: intercept,
    request: request,
    block: block
}