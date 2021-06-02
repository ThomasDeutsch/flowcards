import { EventMap, EventId, toEventId } from './event-map';
import * as utils from './utils';
import { BThreadId } from './bthread';
import { PendingBid } from './pending-bid';
import { AnyAction } from '.';
import { combinedIsValid, PayloadValidationCB } from './validation';
import { CachedItem } from './event-cache';


export type BidType = "requestBid" | "askForBid" | "blockBid" | "extendBid" | "triggerBid" | "setBid" |  "waitForBid" | "onPendingBid" | "validateBid";

export interface Bid {
    type: BidType;
    eventId: EventId;
    payload?: any;
    payloadValidationCB?: PayloadValidationCB<unknown>;
}

export interface PlacedBid extends Bid {
    bThreadId: BThreadId;
}

export interface ProgressedBid extends PlacedBid {
    cancelledBids?: EventMap<PlacedBid>;
    resolve?: (payload?: unknown) => void;
}

export type RequestingBidType = 'requestBid' | "setBid" | 'triggerBid';

export interface PlacedRequestingBid extends PlacedBid {
    type: RequestingBidType;
}

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export type BThreadBids = {
    pendingBidMap: EventMap<PendingBid>
    placedBids: PlacedBid[]
}
export type BidOrBids =  Bid | (Bid | undefined)[] | undefined;


export function getPlacedBidsForBThread(bThreadId: BThreadId, bidOrBids: BidOrBids, pendingBidMap: EventMap<PendingBid>): BThreadBids {
    const placedBids: PlacedBid[] = utils.toArray(bidOrBids)
        .filter(utils.notUndefined)
        .map(bid => ({...bid, bThreadId: bThreadId}));
    return {
        pendingBidMap: pendingBidMap,
        placedBids: placedBids
    }
}

// bids from multiple BThreads
// --------------------------------------------------------------------------------------------------------------------
export type PlacedBidContext = {
    blockedBy?: [PlacedBid];
    pendingBy?: BThreadId;
    validatedBy?: PlacedBid[];
    bids: PlacedBid[];
}
export type AllPlacedBids = EventMap<PlacedBidContext>;

export function allPlacedBids(allBThreadBids: BThreadBids[]): AllPlacedBids {
    const pendingEvents = new EventMap<BThreadId>();
    const blockedEvents = new EventMap<PlacedBid[]>();
    allBThreadBids.forEach(({placedBids, pendingBidMap}) => {
        pendingBidMap.allValues?.forEach(bid => { 
            pendingEvents.set(bid.eventId, bid.bThreadId);
        });
        placedBids.forEach(bid => { 
            if(bid.type === 'blockBid') {
                blockedEvents.update(bid.eventId, (prev = []) => [...prev, bid]);
            }
        });
    });
    const bidsByEventId: AllPlacedBids = new EventMap();
    allBThreadBids.forEach(({placedBids}) => {
        placedBids.forEach(bid => {
            if(bid.type === 'blockBid') return;
            const placedBidsForEventId = bidsByEventId.get(bid.eventId) || {
                blockedBy: utils.flattenShallow(blockedEvents.getExactMatchAndUnkeyedMatch(bid.eventId)), 
                pendingBy: pendingEvents.get(bid.eventId),
                bids: []
            } as PlacedBidContext
            if(bid.type === 'validateBid') {
                placedBidsForEventId.validatedBy = [...(placedBidsForEventId.validatedBy || []), bid];
            } else {
                placedBidsForEventId.bids.push(bid);
            }
            bidsByEventId.set(bid.eventId, placedBidsForEventId);
        });
    });
    return bidsByEventId;
}

export function unblockEventId(allPlacedBids: AllPlacedBids, eventId: EventId): void {
    const context = allPlacedBids.get(eventId)!;
    allPlacedBids.set(eventId, {...context, blockedBy: undefined});
}

function isRequestingBid(bid: Bid): boolean {
    return (bid.type === 'requestBid') || (bid.type === 'setBid') || (bid.type === 'triggerBid')
}

export type BidsByType = Partial<Record<BidType, EventMap<PlacedBid>>>;

export function toBidsByType(bThreadBids: BThreadBids): BidsByType {
    return bThreadBids.placedBids.reduce((bidsByType, bid) => {
        if(bidsByType[bid.type] === undefined) {
            bidsByType[bid.type] = new EventMap<PlacedBid>();
        }
        bidsByType[bid.type]?.set(bid.eventId, bid);
        return bidsByType;
    }, {} as BidsByType);
}

export function getHighestPriorityValidRequestingBidForEveryEventId(allPlacedBids: AllPlacedBids): PlacedRequestingBid[] | undefined {
    const requestingBids: PlacedRequestingBid[] = []
    allPlacedBids.forEach((eventId, bidContext) => {
        if(bidContext.blockedBy || bidContext.pendingBy) return;
        const requestingBidForEvent = [...bidContext.bids].reverse().find(bid => {
            if(!isRequestingBid(bid)) return false;
            if(bid.type === 'triggerBid' && getHighestPrioAskForBid(allPlacedBids, bid.eventId, bid) === undefined) return false;
            return combinedIsValid(bid, bidContext, bid.payload);
        });
        if(requestingBidForEvent) requestingBids.push(requestingBidForEvent as PlacedRequestingBid)
    });
    return requestingBids.length > 0 ? requestingBids : undefined;
}

export function getHighestPrioAskForBid(allPlacedBids: AllPlacedBids, eventId: EventId, actionOrBid?: AnyAction | PlacedBid): PlacedBid | undefined {
    const bidContext = allPlacedBids.get(eventId);
    if(!bidContext) return undefined
    return bidContext.bids.reverse().find(bid => {
        if(bid === undefined || bidContext === undefined) return false;
        if(bid.type !== "askForBid") return false;
        return actionOrBid ? combinedIsValid(bid, bidContext, actionOrBid.payload) : true;
    });
}

export function getMatchingBids(allPlacedBids: AllPlacedBids, types: BidType[], eventId: EventId): PlacedBid[] | undefined {
    let bids = allPlacedBids.get(eventId)?.bids || [];
    if(eventId.key !== undefined) bids = [...bids, ...(allPlacedBids.get({name: eventId.name})?.bids || [])];
    if(bids.length === 0) return undefined;
    const matchingBids = bids?.filter(bid => types.some(type => bid.type === type));
    return matchingBids.length > 0 ? matchingBids : undefined;
}


type cachedItemFn = (cachedItem: CachedItem<unknown>) => void;

// bids user-API --------------------------------------------------------------------

export function request(event: string | EventId, payload?: unknown | cachedItemFn): Bid {
    return {
        type: 'requestBid',
        eventId: toEventId(event), 
        payload: payload
    };
}

export function set(event: string | EventId, payload?: unknown | cachedItemFn): Bid {
    return {
        type: 'setBid',
        eventId: toEventId(event), 
        payload: payload
    };
}

export function trigger(event: string | EventId, payload?: unknown): Bid {
    return {
        type: 'triggerBid',
        eventId: toEventId(event), 
        payload: payload
    };
}

export function askFor<T = string>(event: string | EventId, payloadValidationCB?: PayloadValidationCB<T>): Bid {
    return { 
        type: 'askForBid',
        eventId: toEventId(event), 
        payloadValidationCB: payloadValidationCB
    };
}

export function waitFor<T = string>(event: string | EventId, payloadValidationCB?: PayloadValidationCB<T>): Bid {
    return { 
        type: 'waitForBid',
        eventId: toEventId(event), 
        payloadValidationCB: payloadValidationCB
    };
}

export function onPending(event: string | EventId): Bid {
    return { 
        type: 'onPendingBid',
        eventId: toEventId(event)
    };
}

export function block(event: string | EventId): Bid {
    return { 
        type: 'blockBid',
        eventId: toEventId(event)
    };
}

export function extend<T = string>(event: string | EventId, payloadValidationCB?: PayloadValidationCB<T>): Bid {
    return { 
        type: 'extendBid',
        eventId: toEventId(event), 
        payloadValidationCB: payloadValidationCB
    };
}

export function validate<T = string>(event: string | EventId, payloadValidationCB: PayloadValidationCB<T>): Bid {
    return { 
        type: 'validateBid',
        eventId: toEventId(event), 
        payloadValidationCB: payloadValidationCB
    };
}