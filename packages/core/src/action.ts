import { Bid, BidSubType } from './bid';
import { EventMap, EventId } from './event-map';
import { getGuardForWaits } from './guard';
import { BThreadId } from './bthread';

export enum ActionType {
    requested = "requested",
    ui = "ui",
    resolved = "resolved",
    rejected = "rejected"
}

export interface Action {
    loopIndex: number | null;
    type: ActionType;
    bThreadId: BThreadId;
    event: EventId;
    payload?: any;
    resolveLoopIndex?: number | null;
    resolve?: {
        isResolvedExtend: boolean;
        requestLoopIndex: number;
        requestDuration: number;  
    };
}

function getRandom<T>(coll: T[] | undefined): [T | undefined, T[] | undefined] {
    if (!coll || coll.length === 0) return [undefined, undefined]
    if (coll.length === 1) return [coll[0], undefined];
    const randomIndex = Math.floor(Math.random() * coll.length);
    const value = coll.splice(randomIndex, 1)[0];
    return [value, coll];
}

function getBid(bids?: Bid[], waitBids?: EventMap<Bid[]>): Bid | undefined {
    if(!bids) return undefined;
    const checkBids = [...bids];
    while (checkBids.length > 0) {
        const bid = checkBids.pop();
        if(!bid) continue;
        if(bid.subType === BidSubType.trigger) {
            const waitsForEvent = waitBids?.get(bid.event);
            if(waitsForEvent) {
                const guard = getGuardForWaits(waitsForEvent, bid.event);
                if(!guard || guard(bid.payload)) return bid;
            }
        } else {
            return bid;
        }
    }
    return undefined;
}

function getActionFromBid(bid: Bid) {
    const action = {
        loopIndex: null,
        type: ActionType.requested,
        bThreadId: bid.bThreadId,
        event: bid.event,
        payload: bid.payload
    };
    return action;
}

export function getNextActionFromRequests(requestBids?: EventMap<Bid[]>, waitBids?: EventMap<Bid[]>): Action | undefined {
    if(!requestBids) return undefined;
    const events = requestBids.allEvents;
    if(!events) return undefined;
    let [selectedEvent, rest] = getRandom(events);
    while(selectedEvent) {
        const bids = requestBids.get(selectedEvent);
        const bid = getBid(bids, waitBids);
        if(bid) {
            return getActionFromBid(bid);
        } 
        [selectedEvent, rest] = getRandom(rest);
    }
    return undefined; 
}
