import { NameKeyId, NameKeyMap } from './name-key-map';
import * as utils from './utils';
import { isSameNameKeyId, UEvent, TEvent } from '.';
import { PayloadValidationCB } from './validation';
import { BThreadProgressInfo } from './bthread-core';

export type BidType = "requestBid" | "askForBid" | "blockBid" | "extendBid" | "triggerBid" |  "waitForBid" | "validateBid" | "catchErrorBid";

export interface Bid<P, V> {
    type: BidType;
    eventId: NameKeyId;
    payload?: P | PayloadCB<P | undefined>;
    payloadValidationCB?: PayloadValidationCB<any, V>;
}

export interface PlacedBid<P = any, V = any> extends Bid<P, V> {
    bThreadId: NameKeyId;
}

export function isRequestBid(bid: Bid<unknown, unknown>): boolean {
    return (bid.type === 'requestBid');
}

export function isRequestOrTriggerBid(bid: Bid<unknown, unknown>): boolean {
    return (bid.type === 'requestBid') || (bid.type === 'triggerBid');
}

export function isSameBid<P>(a: Bid<P, unknown>, b: Bid<P, unknown>): boolean {
    return isSameNameKeyId(a.eventId, b.eventId) && a.type === b.type;
}

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export type BidOrBids =  Bid<any, any> | Bid<any, any>[];


export function getPlacedBidsForBThread(bThreadId: NameKeyId, bidOrBids?: BidOrBids): PlacedBid[] {
    const bids = bidOrBids ? utils.toArray(bidOrBids) : undefined;
    if(bids === undefined) return [];
    return bids.map(bid => {
            const pb: PlacedBid = bid as PlacedBid;
            pb.bThreadId = bThreadId;
            return pb;
    }).reverse();
}

// bids from multiple BThreads
// --------------------------------------------------------------------------------------------------------------------
export type AllPlacedBids = {
    orderedRequestingBids: PlacedBid[];
    'blockBid': NameKeyMap<PlacedBid[]>;
    'validateBid': NameKeyMap<PlacedBid[]>;
    'requestBid': NameKeyMap<PlacedBid[]>;
    'triggerBid': NameKeyMap<PlacedBid[]>;
    'waitForBid': NameKeyMap<PlacedBid[]>;
    'askForBid': NameKeyMap<PlacedBid[]>;
    'extendBid': NameKeyMap<PlacedBid[]>;
    'catchErrorBid': NameKeyMap<PlacedBid[]>;
}


export function allPlacedBids(allBThreadBids: PlacedBid[]): AllPlacedBids {
    const result: AllPlacedBids = {
        orderedRequestingBids: [],
        blockBid: new NameKeyMap<PlacedBid[]>(),
        validateBid: new NameKeyMap<PlacedBid[]>(),
        requestBid: new NameKeyMap<PlacedBid[]>(),
        triggerBid: new NameKeyMap<PlacedBid[]>(),
        waitForBid: new NameKeyMap<PlacedBid[]>(),
        askForBid: new NameKeyMap<PlacedBid[]>(),
        extendBid: new NameKeyMap<PlacedBid[]>(),
        catchErrorBid: new NameKeyMap<PlacedBid[]>()
    }
    const orderedBids = new NameKeyMap<PlacedBid>();
    allBThreadBids.reverse().forEach(bid => { // bids - from high to low priority
        switch(bid.type) {
            case 'triggerBid': {
                result.triggerBid.update(bid.eventId, (prev = []) => [...prev, bid]);
                if(!orderedBids.has(bid.eventId)) {
                    orderedBids.set(bid.eventId, bid);
                }
                break;
            }
            case 'requestBid': {
                result.requestBid.update(bid.eventId, (prev = []) => [...prev, bid]);
                if(!orderedBids.has(bid.eventId)) {
                    orderedBids.set(bid.eventId, bid);
                }
                break;
            }
            case 'askForBid': {
                result.askForBid.update(bid.eventId, (prev = []) => [...prev, bid]);
                break;
            }
            case 'validateBid': {
                result.validateBid.update(bid.eventId, (prev = []) => [...prev, bid]);
                break;
            }
            case 'waitForBid': {
                result.waitForBid.update(bid.eventId, (prev = []) => [...prev, bid]);
                break;
            }
            case 'extendBid': {
                result.extendBid.update(bid.eventId, (prev = []) => [...prev, bid]);
                break;
            }
            case 'catchErrorBid': {
                result.catchErrorBid.update(bid.eventId, (prev = []) => [...prev, bid]);
                break;
            }
            case 'blockBid': {
                result.blockBid.update(bid.eventId, (prev = []) => [...prev, bid]);
                break;
            }
        }
    });
    result.orderedRequestingBids = orderedBids.allValues || [];
    return result;
}

type PayloadCB<P> = () => P | Promise<P>;

function getNameKeyId<P>(event: UEvent<P> | TEvent<P> | NameKeyId ): NameKeyId {
    return 'id' in event ? event.id : {name: event.name, key: event.key}
}

// bids user-API --------------------------------------------------------------------

export function request<P, V>(event: TEvent<P, V>, payload?: P | PayloadCB<P | undefined>, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P, V> {
    return { type: 'requestBid', eventId: getNameKeyId(event), payload: payload, payloadValidationCB: payloadValidationCB };
}

export function trigger<P, V>(event: UEvent<P, V>, payload?: P | undefined, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P, V> {
    return { type: 'triggerBid', eventId: getNameKeyId(event), payload: payload, payloadValidationCB: payloadValidationCB };
}

export function askFor<P, V>(event: UEvent<P, V>, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P, V> {
    return { type: 'askForBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function waitFor<P, V>(event: TEvent<P, V> | UEvent<P, V>, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P, V> {
    return { type: 'waitForBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function extend<P, V>(event: TEvent<P, V> | UEvent<P, V>, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P, V> {
    return { type: 'extendBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function block<P>(event: TEvent<P, any> | UEvent<P, any>): Bid<P, any> {
    return { type: 'blockBid', eventId: getNameKeyId(event) };
}

export function catchError<P>(event: TEvent<P, any>): Bid<P, any> {
    return { type: 'catchErrorBid', eventId: getNameKeyId(event) };
}

export function validate<P, V>(event: TEvent<P, V> | UEvent<P, V>, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P, V> {
    return { type: 'validateBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function* bid<P>(bid: Bid<P, any>): Generator<BidOrBids, (P | undefined), BThreadProgressInfo> {
    const x = yield bid;
    if(x.event.value === undefined) return undefined;
    return x.event.value as P;
}

export function* extendBid<P, V>(event: TEvent<P, V> | UEvent<P,V>, payloadValidationCB?: PayloadValidationCB<P, V>): Generator<BidOrBids, (P | undefined), BThreadProgressInfo> {
    const bid = extend(event, payloadValidationCB);
    const x = yield bid;
    if(x.event.__getExtendValue === undefined) return undefined;
    return x.event.__getExtendValue(x.bThreadId) as P;
}
