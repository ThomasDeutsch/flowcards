import { EventMap, EventId, toEventId } from './event-map';
import { Validation } from './validation';
import * as utils from './utils';
import { BThreadId } from './bthread';
import { PendingBid } from './pending-bid';


export enum BidType {
    request = "request",
    askFor = "askFor",
    block = "block",
    extend = "extend",
    trigger = "trigger",
    set = "set",
    waitFor = "waitFor",
    onPending = "onPending"
}

export interface Bid {
    type: BidType;
    eventId: EventId;
    payload?: any;
    validate?: Validation;
}

export interface PlacedBid extends Bid {
    bThreadId: BThreadId;
}

export interface ProgressedBid extends PlacedBid {
    cancelledBids?: EventMap<PlacedBid>;
    resolve?: (payload: any) => void;
}

export type RequestingBidType = BidType.request | BidType.set | BidType.trigger;

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
export type PlacedBidContext = {blockedBy?: [BThreadId], pendingBy?: BThreadId, bids: PlacedBid[]}
export type AllPlacedBids = EventMap<PlacedBidContext>;

export function allPlacedBids(allBThreadBids: BThreadBids[]): AllPlacedBids {
    const pendingEvents = new EventMap<BThreadId>();
    const blockedEvents = new EventMap<BThreadId[]>();
    allBThreadBids.forEach(({placedBids, pendingBidMap}) => {
        pendingBidMap.allValues?.forEach(bid => { 
            pendingEvents.set(bid.eventId, bid.bThreadId);
        });
        placedBids.forEach(bid => { 
            if(bid.type === BidType.block) {
                blockedEvents.update(bid.eventId, (prev = []) => [...prev, bid.bThreadId]);
            }
        });
    });
    const bidsByEventId: AllPlacedBids = new EventMap();
    allBThreadBids.forEach(({placedBids}) => {
        placedBids.forEach(bid => {
            const waitingBidsForEventId = bidsByEventId.get(bid.eventId) || {
                blockedBy: utils.flattenShallow(blockedEvents.getExactMatchAndUnkeyedMatch(bid.eventId)), 
                pendingBy: pendingEvents.get(bid.eventId), 
                bids: []
            } as PlacedBidContext
            waitingBidsForEventId.bids.push(bid);
            bidsByEventId.set(bid.eventId, waitingBidsForEventId);
        });
    });
    return bidsByEventId;
}

export function unblockEventId(allPlacedBids: AllPlacedBids, eventId: EventId): void {
    const context = allPlacedBids.get(eventId)!;
    allPlacedBids.set(eventId, {...context, blockedBy: undefined});
}

function isRequestingBid(bid: Bid): boolean {
    return (bid.type === BidType.request) || (bid.type === BidType.set) || (bid.type === BidType.trigger)
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

export function getAllRequestingBids(allPlacedBids: AllPlacedBids): PlacedRequestingBid[] | undefined {
    const requestingBids: PlacedRequestingBid[] = []
    allPlacedBids.forEach((eventId, context) => {
        if(context.blockedBy || context.pendingBy) return;
        context.bids.forEach(bid => {
            if(!isRequestingBid(bid)) return;
            if(bid.type === BidType.trigger && getHighestPrioAskForBid(allPlacedBids, bid.eventId) === undefined) return;
            requestingBids.push(bid as PlacedRequestingBid)
        });
    });
    return requestingBids.length > 0 ? requestingBids : undefined;
}

// export function hasValidMatch(bidsByType: BidsByType, bidType: BidType, event: EventId, withPayload?: WithPayload): boolean {
//     const bidsMap = bidsByType[bidType];
//     const bids = flattenShallow(bidsMap?.getExactMatchAndUnkeyedMatch(event));
//     if(bids === undefined) return false;
//     if(withPayload === undefined) return true;
//     return withValidPayload(bids, withPayload.payload);
// }

export function getMatchingBids(allPlacedBids: AllPlacedBids, types: BidType[], eventId: EventId): PlacedBid[] | undefined {
    let bids = allPlacedBids.get(eventId)?.bids || [];
    if(eventId.key !== undefined) bids = [...bids, ...(allPlacedBids.get({name: eventId.name})?.bids || [])];
    if(bids.length === 0) return undefined;
    const matchingBids = bids?.filter(bid => types.some(type => bid.type === type));
    return matchingBids.length > 0 ? matchingBids : undefined;
}

export function getHighestPrioAskForBid(allPlacedBids: AllPlacedBids, eventId: EventId): PlacedBid | undefined {
    const bidContext = allPlacedBids.get(eventId);
    if(!bidContext || bidContext.blockedBy || bidContext.pendingBy) return undefined
    return bidContext.bids.reverse().find(bid => bid.type === BidType.askFor);
}


// bids user-API --------------------------------------------------------------------

export function request(event: string | EventId, payload?: unknown): Bid {
    return {
        type: BidType.request,
        eventId: toEventId(event), 
        payload: payload
    };
}

export function set(event: string | EventId, payload?: unknown): Bid {
    return {
        type: BidType.set,
        eventId: toEventId(event), 
        payload: payload
    };
}

export function trigger(event: string | EventId, payload?: unknown): Bid {
    return {
        type: BidType.trigger,
        eventId: toEventId(event), 
        payload: payload
    };
}

export function askFor(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.askFor,
        eventId: toEventId(event), 
        validate: validation
    };
}

export function waitFor(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.waitFor,
        eventId: toEventId(event), 
        validate: validation
    };
}

export function onPending(event: string | EventId): Bid {
    return { 
        type: BidType.onPending,
        eventId: toEventId(event)
    };
}

export function block(event: string | EventId): Bid {
    return { 
        type: BidType.block,
        eventId: toEventId(event)
    };
}

export function extend(event: string | EventId, validation?: Validation): Bid {
    return { 
        type: BidType.extend,
        eventId: toEventId(event), 
        validate: validation
    };
}