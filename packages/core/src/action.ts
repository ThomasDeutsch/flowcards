import { BidsForBidType, Bid, BidSubType } from "./bid";
import { FCEvent, EventMap } from './event';
import { getGuardForWaits } from './guard';
import * as utils from './utils';
import { BThreadDictionary } from './update-loop';
import { EventCache } from "./event-cache";


export enum ActionType {
    initial = "initial",
    requested = "requested",
    promise = "promise",
    dispatched = "dispatched",
    resolved = "resolved",
    rejected = "rejected",
    replay = "replay"
}


export interface Action {
    type: ActionType;
    threadId: string;
    event: FCEvent;
    payload?: any;
    pendingDuration?: number;
}


function getRandom<T>(coll: T[] | undefined): [T | undefined, T[] | undefined] {
    if (!coll || coll.length === 0) return [undefined, undefined]
    if (coll.length === 1) return [coll[0], undefined];
    const randomIndex = Math.floor(Math.random() * coll.length);
    const value = coll.splice(randomIndex, 1)[0];
    return [value, coll];
}


function getBid(bids?: Bid[], waitBids?: BidsForBidType): Bid | undefined {
    if(!bids) return undefined;
    const reversedBids = [...bids].reverse(); // last bid has the highest priority.
    for (const bid of reversedBids) {
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


export function getNextActionFromRequests(bThreadDictionary: BThreadDictionary, eventCache: EventCache, requestBids: BidsForBidType, waitBids?: EventMap<Bid[]>): Action | undefined {
    if(!requestBids) return undefined;
    const events = requestBids.allEvents;
    if(!events) return undefined;
    let [selectedEvent, rest] = getRandom(events);
    while(selectedEvent) {
        const bids = requestBids.get(selectedEvent);
        const bid = getBid(bids, waitBids);
        if(bid) {
            let isPromise = false;
            if (typeof bid.payload === "function") {
                bid.payload = bid.payload(eventCache.get(bid.event)?.value);
            } else if(bid.payload === undefined) {
                bid.payload = eventCache.get(bid.event)?.value;
            }
            if(utils.isThenable(bid.payload) && bThreadDictionary[bid.threadId]) {
                bThreadDictionary[bid.threadId].addPendingRequest(bid, bid.payload);
                isPromise = true;
            }
            return {
                type: isPromise ? ActionType.promise : ActionType.requested,
                threadId: bid.threadId,
                event: bid.event,
                payload: isPromise ? undefined : bid.payload,
            };
        } 
        [selectedEvent, rest] = getRandom(rest);
    }
    return undefined; 
}