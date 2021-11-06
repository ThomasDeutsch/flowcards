import { NameKeyId, NameKeyMap } from './name-key-map';
import * as utils from './utils';
import { BThreadGenerator } from '.';
import { getAllPayloadValidationCallbacks, isValidPayload, PayloadValidationCB } from './validation';
import { BEvent, BEventKeyed } from './b-event';
import { EventMap } from './update-loop';
import { ScenarioProgressInfo } from './bthread-core';
import { Logger } from './logger';

export type BidType = "requestBid" | "askForBid" | "blockBid" | "extendBid" | "triggerBid" |  "waitForBid" | "onPendingBid" | "validateBid";

export interface Bid<P> {
    type: BidType;
    eventId: NameKeyId;
    payload?: P | UpdatePayloadCb<P | undefined>;
    payloadValidationCB?: PayloadValidationCB<P, any>;
}

export interface PlacedBid<P = any> extends Bid<P> {
    bThreadId: NameKeyId;
}

export type RequestingBidType = 'requestBid' | 'triggerBid';

export interface SelectedRequestingBid extends PlacedBid {
    type: RequestingBidType;
    matchedAskForBThreadId?: NameKeyId;
}

// bids from BThreads
// --------------------------------------------------------------------------------------------------------------------

export type BThreadBids = {
    pendingBidMap: NameKeyMap<NameKeyId>;
    placedBids: PlacedBid[];
}
export type BidOrBids =  Bid<any> | Bid<any>[];


export function getPlacedBidsForBThread(bThreadId: NameKeyId, bidOrBids?: BidOrBids): PlacedBid[] {
    const bids = bidOrBids ? utils.toArray(bidOrBids) : undefined;
    if(bids === undefined) return [];
    const placedBids = bids.reverse().map(bid => {
            const pb: PlacedBid = bid as PlacedBid;
            pb.bThreadId = bThreadId;
            return pb;
        });
    return placedBids;
}

// bids from multiple BThreads
// --------------------------------------------------------------------------------------------------------------------
export type AllPlacedBids = {
    pending: NameKeyMap<NameKeyId>;
    blocked: NameKeyMap<NameKeyId[]>;
    enabled: NameKeyMap<boolean>;
    validateBids: NameKeyMap<PlacedBid[]>;
    orderedRequestingBids: PlacedBid<any>[];
    waitingBidsByEventId: NameKeyMap<PlacedBid[]>;
}

export function allPlacedBids(allBThreadBids: BThreadBids[], eventMap: EventMap): AllPlacedBids {
    const result: AllPlacedBids = {
        pending: new NameKeyMap<NameKeyId>(),
        blocked: new NameKeyMap<NameKeyId[]>(),
        enabled: new NameKeyMap<boolean>(),
        validateBids: new NameKeyMap<PlacedBid[]>(),
        orderedRequestingBids: [],
        waitingBidsByEventId: new NameKeyMap<PlacedBid[]>()
    }
    allBThreadBids.forEach(({placedBids, pendingBidMap}) => {
        result.pending.merge(pendingBidMap);
        placedBids.forEach(bid => {
            result.enabled.set(bid.eventId, eventMap.has(bid.eventId));
            if(bid.type === 'blockBid') {
                result.blocked.update(bid.eventId, (prev = []) => [...prev, bid.bThreadId]);
            }
            else if(bid.type === 'validateBid') {
                result.validateBids.update(bid.eventId, (prev = []) => [...prev, bid]);
            }
            if(isRequestingBid(bid)) {
                result.orderedRequestingBids.unshift(bid);
            } else {
                result.waitingBidsByEventId.update(bid.eventId, (prev = []) => [bid, ...prev]);
            }

        });
    });
    return result;
}

export function unblockNameKeyId(allPlacedBids: AllPlacedBids, eventId: NameKeyId): void {
    allPlacedBids.blocked.deleteSingle(eventId);
    allPlacedBids.pending.deleteSingle(eventId);
}

function isRequestingBid(bid: Bid<any>): boolean {
    return (bid.type === 'requestBid') || (bid.type === 'triggerBid')
}

export function getHighestPrioAskForBid<P>(placedBidsForEventId?: PlacedBid[]): PlacedBid<P> | undefined {
    return placedBidsForEventId?.find(bid => bid.type === "askForBid");
}

export function getHighestPriorityValidRequestingBid(allPlacedBids: AllPlacedBids, logger: Logger): SelectedRequestingBid | undefined {
    let involvedBThreads: NameKeyId[] = [];
    let matchedAskForBThreadId: NameKeyId | undefined = undefined;
    const foundBid = allPlacedBids.orderedRequestingBids?.find((bid) => {
        let askForBid: PlacedBid | undefined;
        if(!allPlacedBids.enabled.get(bid.eventId) === true) {
            return false;
        }
        if(bid.type === 'triggerBid') {
            askForBid = getHighestPrioAskForBid(allPlacedBids.waitingBidsByEventId.get(bid.eventId));
            if(askForBid === undefined) return false;
            matchedAskForBThreadId = askForBid.bThreadId;
        }
        if(allPlacedBids.blocked.has(bid.eventId)) {
            involvedBThreads = involvedBThreads.concat(allPlacedBids.blocked.get(bid.eventId)!);
            return false;
        }
        if(allPlacedBids.pending.has(bid.eventId)) {
            involvedBThreads = involvedBThreads.concat(allPlacedBids.pending.get(bid.eventId)!);
            return false;
        }
        if(allPlacedBids.validateBids.has(bid.eventId)) {
            involvedBThreads = involvedBThreads.concat(allPlacedBids.validateBids.get(bid.eventId)!.map(v => v.bThreadId));
        }
        const validateBids = allPlacedBids.validateBids.get(bid.eventId);
        if(validateBids !== undefined) {
            involvedBThreads = involvedBThreads.concat(validateBids.map(bid => bid.bThreadId));
            const validationCallbacks = getAllPayloadValidationCallbacks(askForBid || bid, validateBids);
            return isValidPayload(validationCallbacks, bid.payload);
        }
        return true;
    });
    if(foundBid) {
        involvedBThreads.push(foundBid.bThreadId);
        logger.logInvolvedScenariosForNextRequestBid(involvedBThreads);
        return {...foundBid, matchedAskForBThreadId: matchedAskForBThreadId} as SelectedRequestingBid;
    }
    logger.logInvolvedScenariosForNextRequestBid(involvedBThreads);
    return undefined;
}

export function getMatchingBids(allPlacedBids: AllPlacedBids, type: BidType, eventId: NameKeyId): PlacedBid[] | undefined {
    const bids = allPlacedBids.waitingBidsByEventId.get(eventId) || [];
    if(bids.length === 0) return undefined;
    const matchingBids = bids?.filter(bid => bid.type === type);
    return matchingBids.length > 0 ? matchingBids : undefined;
}


type UpdatePayloadCb<P> = (param?: P) => P | Promise<P>;

function getNameKeyId<P>(event: BEvent<P> | BEventKeyed<P> | NameKeyId ): NameKeyId {
    return 'id' in event ? event.id : {name: event.name, key: event.key}
}

// bids user-API --------------------------------------------------------------------

export function request<P>(event: BEvent<P> | NameKeyId, payload?: P | UpdatePayloadCb<P | undefined>): Bid<P> {
    return { type: 'requestBid', eventId: getNameKeyId(event), payload: payload };
}

export function trigger<P>(event: BEvent<P>, payload?: P): Bid<P> {
    return { type: 'triggerBid', eventId: getNameKeyId(event), payload: payload };
}

export function askFor<P>(event: BEvent<P>, payloadValidationCB?: PayloadValidationCB<P, any>): Bid<P> {
    return { type: 'askForBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function waitFor<P>(event: BEvent<P>, payloadValidationCB?: PayloadValidationCB<P, any>): Bid<P> {
    return { type: 'waitForBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function onPending<P>(event: BEvent<P>): Bid<P> {
    return { type: 'onPendingBid', eventId: getNameKeyId(event) };
}

export function extend<P>(event: BEvent<P>, payloadValidationCB?: PayloadValidationCB<P, any>): Bid<P> {
    return { type: 'extendBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function block<P>(event: BEvent<P>): Bid<P> {
    return { type: 'blockBid', eventId: getNameKeyId(event) };
}

export function validate<P>(event: BEvent<P>, payloadValidationCB?: PayloadValidationCB<P, any>): Bid<P> {
    return { type: 'validateBid', eventId: getNameKeyId(event), payloadValidationCB: payloadValidationCB };
}

export function* allOf(...bids: Bid<any>[]): BThreadGenerator {
    while(bids && bids.length > 0) {
        const progress = yield bids;
        bids = progress.remainingBids || [];
    }
}

export function* bid<P>(bid: Bid<P>): Generator<BidOrBids, (P | undefined), ScenarioProgressInfo> {
    const x = yield bid;
    if(x.event.value === undefined) return undefined;
    return x.event.value as P;
}
