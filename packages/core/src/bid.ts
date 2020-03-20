/* eslint-disable @typescript-eslint/no-explicit-any */

export enum BidType {
    wait = "wait",
    intercept = "intercept",
    block = "block",
    request = "request",
    pending = "pending"
}

export interface Bid {
    type: BidType;
    threadId: string;
    eventName: string;
    payload?: any;
    guard?: Function;
}

export type BidArrayDictionary = Record<string, Bid[]>;

export enum BidDictionaryType {
    single = "single",
    array = "array"
}

// Bids from current thread
// --------------------------------------------------------------------------------------------------------------------

export interface BidDictionaries {
    type: BidDictionaryType;
    [BidType.wait]: Record<string, Bid>;
    [BidType.intercept]: Record<string, Bid>;
    [BidType.request]: Record<string, Bid>;
    [BidType.block]: Record<string, Bid>;
    [BidType.pending]: Record<string, Bid>;
}


export function getBidDictionaries(threadId: string, bid: Bid | null | (Bid | null)[], pendingEvents: Set<string>): BidDictionaries | null {
    if(!bid) return null;
    const bd = {
        [BidType.wait]: {},
        [BidType.intercept]: {},
        [BidType.request]: {},
        [BidType.block]: {},
        [BidType.pending]: {}
    }
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
            if(b.type === BidType.request && pendingEvents.has(b.eventName)) {
                type = BidType.pending;
            }
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
    guardedBlocks:Record<string, Function> | null
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
    [BidType.wait]: BidArrayDictionary;
    [BidType.request]: BidArrayDictionary;
    [BidType.intercept]: BidArrayDictionary;
    [BidType.pending]: BidArrayDictionary;
}

export function getAllBids(coll: (BidDictionaries | null)[]): BidDictionariesByType {
    const dictionaries = coll.filter((c): c is BidDictionaries => c !== null);
    const allBlockingBids = getAllBidsForType(BidType.block, dictionaries, null, null);
    const [guardedBlocks, unguardedBlocks] = getCategorizedBlocks(allBlockingBids);
    return {
        [BidType.wait]: getAllBidsForType(BidType.wait, dictionaries, unguardedBlocks, guardedBlocks),
        [BidType.request]: getAllBidsForType(BidType.request, dictionaries, unguardedBlocks, guardedBlocks),
        [BidType.intercept]: getAllBidsForType(BidType.intercept, dictionaries, unguardedBlocks, guardedBlocks),
        [BidType.pending]: getAllBidsForType(BidType.pending, dictionaries, null, null)
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