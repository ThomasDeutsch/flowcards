import { NameKeyId, NameKeyMap } from './name-key-map';
import { GuardCB, GuardResult } from './guard';
import { FlowProgressInfo } from './flow-core';
import { FlowEvent, UserEvent } from './event';

export type NotRequestingBidType = "askForBid" |  "extendBid" |  "waitForBid" | "validateBid" | "blockBid";
export type BidType = NotRequestingBidType | 'triggerBid' | 'requestBid';
type ValueOrPromiseCB<P> = () => P | Promise<P>;
export type PayloadFunction<P> = () => P;

interface BaseBid<P = void, V=string> {
    eventId: NameKeyId;
    guard?: GuardCB<P, V>;
}

export interface RequestBid<P, V> extends BaseBid<P,V> {
    type: 'requestBid';
    payload?: P | ValueOrPromiseCB<P>;
    guard?: () => GuardResult<V>;
}

export interface TriggerBid<P, V> extends BaseBid<P,V> {
    type: 'triggerBid';
    payload?: P | PayloadFunction<P>;
    guard?: () => GuardResult<V>;
}

export interface WaitForBid<P,V> extends BaseBid<P,V> {
    type: 'waitForBid';
}

export interface AskForBid<P,V> extends BaseBid<P,V> {
    type: 'askForBid'
}

export interface ExtendBid<P,V> extends BaseBid<P,V> {
    type: 'extendBid'
}

export interface ValidateBid<P,V> extends BaseBid<P,V> {
    type: 'validateBid'
}

export interface BlockBid<P,V> extends BaseBid<P,V> {
    type: 'blockBid';
    guard?: () => V[];
}


export type Bid<P = any,V = any> = RequestBid<P,V> | TriggerBid<P,V> | WaitForBid<P,V> | AskForBid<P,V> | ExtendBid<P,V> | ValidateBid<P,V> | BlockBid<P,V>;


interface PlacedBidBase<P,V> extends BaseBid<P, V> {
    id: number;
    flowId: NameKeyId;
}

export interface PlacedRequestBid<P,V> extends RequestBid<P, V> {
    id: number;
    flowId: NameKeyId;
    payload: P | ValueOrPromiseCB<P>;
}

export interface PlacedTriggerBid<P,V> extends TriggerBid<P, V> {
    id: number;
    flowId: NameKeyId;
    payload: P | PayloadFunction<P>;
}

export interface PlacedWaitForBid<P,V> extends PlacedBidBase<P, V> {
    type: 'waitForBid';
}

export interface PlacedAskForBid<P,V> extends PlacedBidBase<P, V> {
    type: 'askForBid';
}

export interface PlacedExtendBid<P,V> extends PlacedBidBase<P, V> {
    type: 'extendBid';
}

export interface PlacedValidateBid<P,V> extends PlacedBidBase<P, V> {
    type: 'validateBid';
}

export interface PlacedBlockBid<P,V> extends BlockBid<P,V> {
    id: number;
    flowId: NameKeyId;
}

export type PlacedBid<P= any, V=any> = PlacedRequestBid<P,V> | PlacedTriggerBid<P,V> | PlacedWaitForBid<P,V> | PlacedAskForBid<P,V> | PlacedExtendBid<P,V> | PlacedValidateBid<P,V> | PlacedBlockBid<P, V>;


export function isRequestBid(bid: Bid<unknown, unknown>): boolean {
    return (bid.type === 'requestBid');
}

export function isRequestOrTriggerBid(bid: Bid<unknown, unknown>): boolean {
    return (bid.type === 'requestBid') || (bid.type === 'triggerBid');
}

// bids from Flows
// --------------------------------------------------------------------------------------------------------------------

export type BidOrBids =  undefined | Bid<any, any> | Bid<any, any>[] | PlacedBid<any, any> | PlacedBid<any, any>[];


// bids from multiple Flows
// --------------------------------------------------------------------------------------------------------------------
export type AllPlacedBids = {
    orderedRequestingBids: (PlacedRequestBid<any, any> | PlacedTriggerBid<any, any>)[];
    'requestBid': NameKeyMap<PlacedRequestBid<any, any>[]>;
    'triggerBid': NameKeyMap<PlacedTriggerBid<any, any>[]>;
    'waitForBid': NameKeyMap<PlacedWaitForBid<any, any>[]>;
    'askForBid': NameKeyMap<PlacedAskForBid<any, any>[]>;
    'extendBid': NameKeyMap<PlacedExtendBid<any, any>[]>;
    'validateBid': NameKeyMap<PlacedValidateBid<any, any>[]>;
    'blockBid': NameKeyMap<PlacedBlockBid<any, any>[]>;
}

export function getInitialPlacedBids(): AllPlacedBids {
    return {
        orderedRequestingBids: [],
        requestBid: new NameKeyMap<PlacedRequestBid<any, any>[]>(),
        triggerBid: new NameKeyMap<PlacedTriggerBid<any, any>[]>(),
        waitForBid: new NameKeyMap<PlacedWaitForBid<any, any>[]>(),
        askForBid: new NameKeyMap<PlacedAskForBid<any, any>[]>(),
        extendBid: new NameKeyMap<PlacedExtendBid<any, any>[]>(),
        validateBid: new NameKeyMap<PlacedValidateBid<any, any>[]>(),
        blockBid: new NameKeyMap<PlacedBlockBid<any, any>[]>(),
    }
}

export function allPlacedBids(allFlowBids: (PlacedBid | PlacedTriggerBid<any, any> | PlacedRequestBid<any, any>)[]): AllPlacedBids {
    const result = getInitialPlacedBids();
    const orderedRequestingBids = new NameKeyMap<PlacedRequestBid<any, any> | PlacedTriggerBid<any, any>>();
    allFlowBids.forEach(bid => { // bids - from high to low priority
        switch(bid.type) {
            case 'triggerBid': {
                result.triggerBid.update(bid.eventId, (prev = []) => [...prev, bid]);
                if(!orderedRequestingBids.has(bid.eventId)) {
                    orderedRequestingBids.set(bid.eventId, bid);
                }
                break;
            }
            case 'requestBid': {
                result.requestBid.update(bid.eventId, (prev = []) => [...prev, bid]);
                if(!orderedRequestingBids.has(bid.eventId)) {
                    orderedRequestingBids.set(bid.eventId, bid);
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
            case 'blockBid': {
                result.blockBid.update(bid.eventId, (prev = []) => [...prev, bid]);
                break;
            }
        }
    });
    result.orderedRequestingBids = orderedRequestingBids.allValues || [];
    return result;
}

function getNameKeyId<P>(event: UserEvent<P> | FlowEvent<P> | NameKeyId ): NameKeyId {
    return 'id' in event ? event.id : {name: event.name, key: event.key}
}

// bids user-API --------------------------------------------------------------------

//TODO typing of guard, in case of a promise (void) => GuardResult
export function request<P, V>(event: FlowEvent<P, V>, payload?: P | ValueOrPromiseCB<P>, guard?: () => GuardResult<V> ): RequestBid<P, V> {
    return { type: 'requestBid', eventId: getNameKeyId(event), payload, guard};
}

export function trigger<P, V>(event: UserEvent<P, V>, payload?: P | PayloadFunction<P>, guard?: () => GuardResult<V>): TriggerBid<P, V> {
    return { type: 'triggerBid', eventId: getNameKeyId(event), payload, guard };
}

export function waitFor<P, V>(event: FlowEvent<P, V> | UserEvent<P, V>, guard?: GuardCB<P, V>): WaitForBid<P, V> {
    return { type: 'waitForBid', eventId: getNameKeyId(event), guard };
}

export function askFor<P, V>(event: UserEvent<P, V>, guard?: GuardCB<P, V>): AskForBid<P, V> {
    return { type: 'askForBid', eventId: getNameKeyId(event), guard };
}

export function extend<P, V>(event: FlowEvent<P, V> | UserEvent<P, V>, guard?: GuardCB<P, V>): ExtendBid<P, V> {
    return { type: 'extendBid', eventId: getNameKeyId(event), guard };
}

export function validate<P, V>(event: FlowEvent<P, V> | UserEvent<P, V>, guard: GuardCB<P, V>): ValidateBid<P, V> {
    return { type: 'validateBid', eventId: getNameKeyId(event), guard };
}

export function block<P, V>(event: FlowEvent<P, V> | UserEvent<P, V>, guard?: () => V[]): BlockBid<P, V> {
    return { type: 'blockBid', eventId: getNameKeyId(event), guard };
}

export function* bid<P>(bid: Bid<P, any>): Generator<BidOrBids, (P | undefined), FlowProgressInfo> {
    const x = yield bid;
    if(x.event.value === undefined) return undefined;
    return x.event.value as P;
}

export function* extendBid<P,V>(event: FlowEvent<P, V> | UserEvent<P, V>, guard?: GuardCB<P, V>): Generator<BidOrBids, (P | undefined), FlowProgressInfo> {
    const progress = yield extend(event, guard);
    return progress.extend ? progress.extend.value as P : undefined;
}

export function* allOf(...bids: Bid<any, any>[]): Generator<BidOrBids, void, FlowProgressInfo> {
    while(bids && bids.length > 0) {
        const progress = yield bids;
        bids = progress.remainingBids || [];
    }
}