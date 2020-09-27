import { EventMap, EventId, toEvent } from './event-map';
import { Validation, withValidPayload } from './validation';
import * as utils from './utils';
import { PendingEventInfo, BThreadId } from './bthread';
import { flattenShallow } from './utils';

export enum BidType {
    request = "request",
    wait = "wait",
    block = "block",
    guardedBlock = "guardedBlock",
    extend = "extend",
    trigger = "trigger",
    set = "set",
    on = "on",
    onPending = "onPending"
}

export interface Bid {
    type: BidType;
    bThreadId: BThreadId;
    event: EventId;
    payload?: any;
    validate?: Validation;
}

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export type BThreadBids = Record<BidType, EventMap<Bid>>;
type BidOrBids =  Bid | undefined | (Bid | undefined)[];

export function getBidsForBThread(bThreadId: BThreadId, bidOrBids: BidOrBids, pendingEvents: EventMap<PendingEventInfo>): BThreadBids | undefined {
    if(!bidOrBids) return undefined;
    const bidColl = utils.toArray(bidOrBids).filter(bid => bid !== undefined && bid !== null && !pendingEvents.has(bid.event));
    const bids = {} as BThreadBids;
    if(bidColl.length === 0) return bids;
    return bidColl.reduce((acc: BThreadBids, bid: Bid | undefined): BThreadBids => {
        if(bid !== undefined) {
            if(!acc[bid.type]) {
                acc[bid.type] = new EventMap();
            }
            acc[bid.type]!.set(bid.event, {...bid, bThreadId: bThreadId});
        }
        return acc;
    }, bids);
}

// bids from multiple BThreads
// --------------------------------------------------------------------------------------------------------------------

export type BidsByType = Record<BidType, EventMap<Bid[]> | undefined>;

export function bidsByType(allBThreadBids: BThreadBids[]): BidsByType {
    const bidsByType = {} as BidsByType;
    allBThreadBids.forEach(bids => {
        for(const type in bids) {
            const bidsByEvent = bids[type as BidType];
            if(bidsByEvent !== undefined) {
                if(bidsByType[type as BidType] === undefined) bidsByType[type as BidType] = new EventMap<Bid[]>();
                bidsByEvent.forEach((event, bid) => {
                    bidsByType[type as BidType]!.set(event, [...(bidsByType[type as BidType]!.get(event) || []), bid]);
                })
            }
        }
    });
    return bidsByType;
}

type withPayload = {payload?: any};

export function isBlocked(bidsByType: BidsByType, event: EventId, withPayload?: withPayload): boolean {
    if(bidsByType.block !== undefined) {
        if(bidsByType.block.has(event) || bidsByType.block?.has({name: event.name})) return true;
    }
    if(withPayload && bidsByType.guardedBlock !== undefined) {
        const blockBids = flattenShallow(bidsByType.guardedBlock.getExactMatchAndUnkeyedMatch(event));
        return withValidPayload(blockBids, withPayload.payload);
    }
    return false;
}

export function getBidsForTypes(bidsByType: BidsByType, types: BidType[]): Bid[] | undefined {
    const result = types.reduce((acc: Bid[], type: BidType) => {
        const bids = utils.flattenShallow(bidsByType[type]?.allValues);
        if(bids === undefined) return acc;
        acc.push(...bids);
        return acc;
    }, []);
    if(result.length === 0) return undefined;
    return result;
}

export function hasValidMatch(bidsByType: BidsByType, bidType: BidType, event: EventId, withPayload?: withPayload): boolean {
    const bidsMap = bidsByType[bidType];
    const bids = flattenShallow(bidsMap?.getExactMatchAndUnkeyedMatch(event));
    if(bids === undefined) return false;
    if(withPayload === undefined) return true;
    return withValidPayload(bids, withPayload.payload);
}

export function getMatchingBids(bidsByType: BidsByType, types: BidType[], event: EventId): Bid[] | undefined {
    const result = types.reduce((acc: Bid[], type: BidType) => {
        if(bidsByType[type] === undefined) return acc;
        const matchingBids = bidsByType[type]!.getAllMatchingValues(event);
        if(matchingBids === undefined || matchingBids.length === 0) return acc;
        acc.push(...utils.flattenShallow(matchingBids)!);
        return acc;
    }, []);
    if(result.length === 0) return undefined;
    return result;
}


// bids user-API --------------------------------------------------------------------

export function request(event: string | EventId, payload?: any): Bid {
    return {
        type: BidType.request,
        event: toEvent(event), 
        payload: payload, 
        bThreadId: {id: ""}
    };
}

export function set(event: string | EventId, payload?: any): Bid {
    return {
        type: BidType.set,
        event: toEvent(event), 
        payload: payload,
        bThreadId: {id: ""}
    };
}

export function trigger(event: string | EventId, payload?: any): Bid {
    return {
        type: BidType.trigger,
        event: toEvent(event), 
        payload: payload,
        bThreadId: {id: ""}
    };
}

export function wait(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.wait,
        event: toEvent(event), 
        validate: validation,
        bThreadId: {id: ""}
    };
}

export function on(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.on,
        event: toEvent(event), 
        validate: validation,
        bThreadId: {id: ""}
    };
}

export function onPending(event: string | EventId): Bid {
    return { 
        type: BidType.onPending,
        event: toEvent(event),
        bThreadId: {id: ""}
    };
}

export function block(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: validation ? BidType.guardedBlock : BidType.block,
        event: toEvent(event), 
        validate: validation, 
        bThreadId: {id: ""}
    };
}

export function extend(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.extend,
        event: toEvent(event), 
        validate: validation, 
        bThreadId: {id: ""}
    };
}

