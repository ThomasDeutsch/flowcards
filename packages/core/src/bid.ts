import { EventMap, EventId, toEventId } from './event-map';
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
    eventId: EventId;
    payload?: any;
    validate?: Validation;
}

export interface ActiveBid extends Bid{
    priorityIndex: number;
}

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export type BThreadBids = Record<BidType, EventMap<Bid>>;
type BidOrBids =  Bid | undefined | (Bid | undefined)[];

export function getBidsForBThread(bThreadId: BThreadId, bidOrBids: BidOrBids, pendingEvents: EventMap<PendingEventInfo>): BThreadBids | undefined {
    if(!bidOrBids) return undefined;
    const bidColl = utils.toArray(bidOrBids).filter(bid => bid !== undefined && bid !== null && !pendingEvents.has(bid.eventId));
    const bids = {} as BThreadBids;
    if(bidColl.length === 0) return bids;
    return bidColl.reduce((acc: BThreadBids, bid: Bid | undefined): BThreadBids => {
        if(bid !== undefined) {
            if(!acc[bid.type]) {
                acc[bid.type] = new EventMap();
            }
            acc[bid.type]!.set(bid.eventId, {...bid, bThreadId: bThreadId});
        }
        return acc;
    }, bids);
}

// bids from multiple BThreads
// --------------------------------------------------------------------------------------------------------------------

export type ActiveBidsByType = Record<BidType, EventMap<ActiveBid[]> | undefined>;

export function activeBidsByType(allBThreadBids: BThreadBids[]): ActiveBidsByType {
    const activeBidsByType = {} as ActiveBidsByType;
    allBThreadBids.forEach((bids, priorityIndex) => {
        for(const type in bids) {
            const bidsByEvent = bids[type as BidType];
            if(bidsByEvent !== undefined) {
                if(activeBidsByType[type as BidType] === undefined) activeBidsByType[type as BidType] = new EventMap<ActiveBid[]>();
                bidsByEvent.forEach((event, bid) => {
                    activeBidsByType[type as BidType]!.set(event, [...(activeBidsByType[type as BidType]!.get(event) || []), {...bid, priorityIndex: priorityIndex}]);
                })
            }
        }
    });
    return activeBidsByType;
}

type withPayload = {payload?: any};

export function isBlocked(bidsByType: ActiveBidsByType, event: EventId, withPayload?: withPayload): boolean {
    if(bidsByType.block !== undefined) {
        if(bidsByType.block.has(event) || bidsByType.block?.has({name: event.name})) return true;
    }
    if(withPayload && bidsByType.guardedBlock !== undefined) {
        const blockBids = flattenShallow(bidsByType.guardedBlock.getExactMatchAndUnkeyedMatch(event));
        return withValidPayload(blockBids, withPayload.payload);
    }
    return false;
}

export function getActiveBidsForSelectedTypes(bidsByType: ActiveBidsByType, types: BidType[]): ActiveBid[] | undefined {
    const result = types.reduce((acc: ActiveBid[], type: BidType) => {
        const bids = utils.flattenShallow(bidsByType[type]?.allValues);
        if(bids === undefined) return acc;
        acc.push(...bids);
        return acc;
    }, []);
    if(result.length === 0) return undefined;
    result.sort((a,b) => (a.priorityIndex > b.priorityIndex) ? -1 : ((b.priorityIndex > a.priorityIndex) ? 1 : 0)); 
    return result;
}

export function hasValidMatch(bidsByType: ActiveBidsByType, bidType: BidType, event: EventId, withPayload?: withPayload): boolean {
    const bidsMap = bidsByType[bidType];
    const bids = flattenShallow(bidsMap?.getExactMatchAndUnkeyedMatch(event));
    if(bids === undefined) return false;
    if(withPayload === undefined) return true;
    return withValidPayload(bids, withPayload.payload);
}

export function getMatchingBids(bidsByType: ActiveBidsByType, types: BidType[], event: EventId): Bid[] | undefined {
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
        eventId: toEventId(event), 
        payload: payload, 
        bThreadId: {id: ""}
    };
}

export function set(event: string | EventId, payload?: any): Bid {
    return {
        type: BidType.set,
        eventId: toEventId(event), 
        payload: payload,
        bThreadId: {id: ""}
    };
}

export function trigger(event: string | EventId, payload?: any): Bid {
    return {
        type: BidType.trigger,
        eventId: toEventId(event), 
        payload: payload,
        bThreadId: {id: ""}
    };
}

export function wait(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.wait,
        eventId: toEventId(event), 
        validate: validation,
        bThreadId: {id: ""}
    };
}

export function on(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.on,
        eventId: toEventId(event), 
        validate: validation,
        bThreadId: {id: ""}
    };
}

export function onPending(event: string | EventId): Bid {
    return { 
        type: BidType.onPending,
        eventId: toEventId(event),
        bThreadId: {id: ""}
    };
}

export function block(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: validation ? BidType.guardedBlock : BidType.block,
        eventId: toEventId(event), 
        validate: validation, 
        bThreadId: {id: ""}
    };
}

export function extend(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.extend,
        eventId: toEventId(event), 
        validate: validation, 
        bThreadId: {id: ""}
    };
}

