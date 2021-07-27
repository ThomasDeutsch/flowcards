import { NameKeyId, NameKeyMap } from './name-key-map';
import * as utils from './utils';
import { PendingBid } from './pending-bid';
import { AnyAction, BThreadGenerator } from '.';
import { combinedIsValid, PayloadValidationCB } from './validation';
import { ScenarioEvent, ScenarioEventKeyed } from './scenario-event';
import { EventMap } from './update-loop';

export type BidType = "requestBid" | "askForBid" | "blockBid" | "extendBid" | "triggerBid" |  "waitForBid" | "onPendingBid" | "validateBid";

export interface Bid {
    type: BidType;
    eventId: NameKeyId;
    payload?: any;
    payloadValidationCB?: PayloadValidationCB<any>;
}

export interface PlacedBid extends Bid {
    bThreadId: NameKeyId;
}

export type RequestingBidType = 'requestBid' | 'triggerBid';

export interface PlacedRequestingBid extends PlacedBid {
    type: RequestingBidType;
}

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export type BThreadBids = {
    pendingBidMap: NameKeyMap<PendingBid>;
    placedBids: PlacedBid[];
}
export type BidOrBids =  Bid | (Bid | undefined)[] | undefined;


export function getPlacedBidsForBThread(bThreadId: NameKeyId, bidOrBids: BidOrBids): PlacedBid[] {
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
    pendingBy?: NameKeyId;
    validatedBy?: PlacedBid[];
    bids: PlacedBid[];
}
export type AllPlacedBids = NameKeyMap<PlacedBidContext>;

export function allPlacedBids(allBThreadBids: BThreadBids[], eventMap: EventMap): AllPlacedBids {
    const pendingEvents = new NameKeyMap<NameKeyId>();
    const blockedEvents = new NameKeyMap<PlacedBid[]>();
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
    const bidsByNameKeyId: AllPlacedBids = new NameKeyMap();
    allBThreadBids.forEach(({placedBids}) => {
        placedBids.forEach(bid => {
            if(bid.type === 'blockBid') return;
            if(!eventMap.get(bid.eventId)?.isEnabled) return;
            const placedBidsForNameKeyId = bidsByNameKeyId.get(bid.eventId) || {
                blockedBy: blockedEvents.get(bid.eventId),
                pendingBy: pendingEvents.get(bid.eventId),
                bids: []
            } as PlacedBidContext
            if(bid.type === 'validateBid') {
                placedBidsForNameKeyId.validatedBy = [...(placedBidsForNameKeyId.validatedBy || []), bid];
            } else {
                placedBidsForNameKeyId.bids.push(bid);
            }
            bidsByNameKeyId.set(bid.eventId, placedBidsForNameKeyId);
        });
    });
    return bidsByNameKeyId;
}

export function unblockNameKeyId(allPlacedBids: AllPlacedBids, eventId: NameKeyId): void {
    const context = allPlacedBids.get(eventId)!;
    //TODO: set event is pending back to
    allPlacedBids.set(eventId, {...context, blockedBy: undefined, pendingBy: undefined});
}

function isRequestingBid(bid: Bid): boolean {
    return (bid.type === 'requestBid') || (bid.type === 'triggerBid')
}

export type BidsByType = Partial<Record<BidType, NameKeyMap<PlacedBid>>>;

export function toBidsByType(bThreadBids: BThreadBids): BidsByType {
    return bThreadBids.placedBids.reduce((bidsByType, bid) => {
        if(bidsByType[bid.type] === undefined) {
            bidsByType[bid.type] = new NameKeyMap<PlacedBid>();
        }
        bidsByType[bid.type]?.set(bid.eventId, bid);
        return bidsByType;
    }, {} as BidsByType);
}

export function getHighestPriorityValidRequestingBidForEveryNameKeyId(allPlacedBids: AllPlacedBids): PlacedRequestingBid[] | undefined {
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

export function getHighestPrioAskForBid(allPlacedBids: AllPlacedBids, eventId: NameKeyId, actionOrBid?: AnyAction | PlacedBid): PlacedBid | undefined {
    const bidContext = allPlacedBids.get(eventId);
    if(!bidContext) return undefined
    return bidContext.bids.reverse().find(bid => {
        if(bid === undefined || bidContext === undefined) return false;
        if(bid.type !== "askForBid") return false;
        return actionOrBid ? combinedIsValid(bid, bidContext, actionOrBid.payload) : true;
    });
}

export function getMatchingBids(allPlacedBids: AllPlacedBids, types: BidType[], eventId: NameKeyId): PlacedBid[] | undefined {
    const bids = allPlacedBids.get(eventId)?.bids || [];
    if(bids.length === 0) return undefined;
    const matchingBids = bids?.filter(bid => types.some(type => bid.type === type));
    return matchingBids.length > 0 ? matchingBids : undefined;
}


type UpdatePayloadCb<P> = (param?: P) => P | Promise<P>;

function getNameKeyId<P>(event: ScenarioEvent<P> | ScenarioEventKeyed<P> | NameKeyId ): NameKeyId {
    return 'id' in event ? event.id : {name: event.name, key: event.key}
}

// bids user-API --------------------------------------------------------------------

export function request<P>(event: ScenarioEvent<P> | NameKeyId, payload?: P | UpdatePayloadCb<P | undefined> | undefined): Bid {
    return {
        type: 'requestBid',
        eventId: getNameKeyId(event),
        payload: payload
    };
}

export function trigger<P>(event: ScenarioEvent<P> | NameKeyId, payload?: P): Bid {
    return { type: 'triggerBid', eventId: getNameKeyId(event), payload: payload };
}

export function askFor<P>(event: ScenarioEvent<P> | NameKeyId, payloadValidationCB?: PayloadValidationCB<P>): Bid {
    return { type: 'askForBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function waitFor<P>(event: ScenarioEvent<P> | NameKeyId, payloadValidationCB?: PayloadValidationCB<P>): Bid {
    return { type: 'waitForBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function onPending<P>(event: ScenarioEvent<P> | NameKeyId): Bid {
    return { type: 'onPendingBid', eventId: getNameKeyId(event) };
}

export function extend<P>(event: ScenarioEvent<P> | NameKeyId, payloadValidationCB?: PayloadValidationCB<P>): Bid {
    return { type: 'extendBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function block<P>(event: ScenarioEvent<P> | NameKeyId): Bid {
    return { type: 'blockBid', eventId: getNameKeyId(event) };
}

//TODO:  to be able to create a blockAll helper function, a bid needs to to able to accept multiple eventIds.
// export function blockAll<P>(events: ScenarioEventKeyed, ...keys: string | number): Bid[] {
//     return { type}
// }

export function validate<P>(event: ScenarioEvent<P> | NameKeyId, payloadValidationCB?: PayloadValidationCB<P>): Bid {
    return { type: 'validateBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function* allOf(...bids: Bid[]): BThreadGenerator {
    while(bids && bids.length > 0) {
        const progress = yield bids;
        bids = progress.remainingBids || [];
    }
}
