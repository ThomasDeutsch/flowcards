import { NameKeyId, NameKeyMap } from './name-key-map';
import * as utils from './utils';
import { BUIEvent, isSameNameKeyId } from '.';
import { PayloadValidationCB } from './validation';
import { BEvent, BEventKeyed } from './b-event';
import { BThreadProgressInfo } from './bthread-core';

export type BidType = "requestBid" | "askForBid" | "blockBid" | "extendBid" | "triggerBid" |  "waitForBid" | "validateBid" | "catchErrorBid";

export interface Bid<P> {
    type: BidType;
    eventId: NameKeyId;
    payload?: P | PayloadCB<P>;
    payloadValidationCB?: PayloadValidationCB<P, any>;
}

export interface PlacedBid<P = any> extends Bid<P> {
    bThreadId: NameKeyId;
}

export function isRequestBid(bid: Bid<any>): boolean {
    return (bid.type === 'requestBid');
}

export function isRequestOrTriggerBid(bid: Bid<any>): boolean {
    return (bid.type === 'requestBid') || (bid.type === 'triggerBid');
}

export function isSameBid<P>(a: Bid<P>, b: Bid<P>): boolean {
    return isSameNameKeyId(a.eventId, b.eventId) && a.type === b.type;
}

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export type BidOrBids =  Bid<any> | Bid<any>[];


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
    allBThreadBids.reverse().forEach(bid => {
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

function getNameKeyId<P>(event: BEvent<P> | BEventKeyed<P> | NameKeyId ): NameKeyId {
    return 'id' in event ? event.id : {name: event.name, key: event.key}
}

// bids user-API --------------------------------------------------------------------

export function request<P, V>(event: BEvent<P> | NameKeyId, payload?: P | PayloadCB<P>, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P> {
    return { type: 'requestBid', eventId: getNameKeyId(event), payload: payload, payloadValidationCB: payloadValidationCB };
}

export function trigger<P, V>(event: BUIEvent<P, V>, payload?: P, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P> {
    return { type: 'triggerBid', eventId: getNameKeyId(event), payload: payload, payloadValidationCB: payloadValidationCB };
}

export function askFor<P, V>(event: BUIEvent<P, V>, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P> {
    return { type: 'askForBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function waitFor<P, V>(event: BEvent<P, V>, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P> {
    return { type: 'waitForBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function extend<P, V>(event: BEvent<P, V>, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P> {
    return { type: 'extendBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function block<P>(event: BEvent<P>): Bid<P> {
    return { type: 'blockBid', eventId: getNameKeyId(event) };
}

export function catchError<P>(event: BEvent<P>): Bid<P> {
    return { type: 'catchErrorBid', eventId: getNameKeyId(event) };
}

export function validate<P, V>(event: BEvent<P, V>, payloadValidationCB?: PayloadValidationCB<P, V>): Bid<P> {
    return { type: 'validateBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function* bid<P>(bid: Bid<P>): Generator<BidOrBids, (P | undefined), BThreadProgressInfo> {
    const x = yield bid;
    if(x.event.value === undefined) return undefined;
    return x.event.value as P;
}

export function* extendBid<P, V>(event: BEvent<P, V>, payloadValidationCB?: PayloadValidationCB<P, V>): Generator<BidOrBids, (P | undefined), BThreadProgressInfo> {
    const bid = extend(event, payloadValidationCB);
    const x = yield bid;
    if(x.event.__getExtendValue === undefined) return undefined;
    return x.event.__getExtendValue(x.bThreadId) as P;
}
