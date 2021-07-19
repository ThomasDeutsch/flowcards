import { EventMap, EventId } from './event-map';
import * as utils from './utils';
import { BThreadId } from './bthread';
import { PendingBid } from './pending-bid';
import { AnyAction } from '.';
import { combinedIsValid, PayloadValidationCB } from './validation';
import { ScenarioEvent } from './scenario-event';

export type BidType = "requestBid" | "askForBid" | "blockBid" | "extendBid" | "triggerBid" |  "waitForBid" | "onPendingBid" | "validateBid";

export interface Bid {
    type: BidType;
    eventId: EventId;
    payload?: any;
    payloadValidationCB?: PayloadValidationCB<any>;
}

export interface PlacedBid extends Bid {
    bThreadId: BThreadId;
}

export interface ProgressedBid extends PlacedBid {
    resolve?: (payload?: unknown) => void;
    is: (eventId: EventId | string) => boolean;
    remainingBids?: PlacedBid[];
}

export type RequestingBidType = 'requestBid' | 'triggerBid';

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


export function getPlacedBidsForBThread(bThreadId: BThreadId, bidOrBids: BidOrBids): PlacedBid[] {
    const placedBids: PlacedBid[] = utils.toArray(bidOrBids)
        .filter(utils.notUndefined)
        .map(bid => {
            const pb: PlacedBid = bid as PlacedBid;
            pb.bThreadId = bThreadId;
            return pb;
        });
    return placedBids;
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
    return (bid.type === 'requestBid') || (bid.type === 'triggerBid')
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


type updatePayloadCb<T> = (payload: T) => T;

// bids user-API --------------------------------------------------------------------

export function request<P>(event: ScenarioEvent<P>, payload?: P | updatePayloadCb<P>): Bid {
    return { type: 'requestBid', eventId: event.id, payload: payload };
}

// export function set<P>(event: ScenarioEvent<P>, payload?: P | updatePayloadCb<P>): Bid {
//     return { type: 'setBid', eventId: event.id, payload: payload };
// }

export function trigger<P>(event: ScenarioEvent<P>, payload?: P): Bid {
    return { type: 'triggerBid', eventId: event.id, payload: payload };
}

export function askFor<P>(event: ScenarioEvent<P>, payloadValidationCB?: PayloadValidationCB<P>): Bid {
    return { type: 'askForBid', eventId: event.id, payloadValidationCB: payloadValidationCB };
}

export function waitFor<P>(event: ScenarioEvent<P>, payloadValidationCB?: PayloadValidationCB<P>): Bid {
    return { type: 'waitForBid', eventId: event.id, payloadValidationCB: payloadValidationCB };
}

export function onPending<P>(event: ScenarioEvent<P>): Bid {
    return { type: 'onPendingBid', eventId: event.id };
}

export function extend<P>(event: ScenarioEvent<P>, payloadValidationCB?: PayloadValidationCB<P>): Bid {
    return { type: 'extendBid', eventId: event.id, payloadValidationCB: payloadValidationCB };
}

export function block<P>(event: ScenarioEvent<P>): Bid {
    return { type: 'blockBid', eventId: event.id };
}

export function validate<P>(event: ScenarioEvent<P>, payloadValidationCB?: PayloadValidationCB<P>): Bid {
    return { type: 'validateBid', eventId: event.id, payloadValidationCB: payloadValidationCB };
}
