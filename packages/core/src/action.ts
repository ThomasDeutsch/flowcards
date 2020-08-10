import { Bid, BidsForBidType, BidSubType } from './bid';
import { EventMap, FCEvent } from './event';
import { getGuardForWaits } from './guard';

export enum ActionType {
    requested = "requested",
    dispatched = "dispatched",
    resolved = "resolved",
    rejected = "rejected"
}

export interface Action {
    index: number | null;
    type: ActionType;
    threadId: string;
    event: FCEvent;
    payload?: any;
    resolve?: {
        requestDuration: number;
        requestedActionIndex: number;
    };
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

function getActionFromBid(bid: Bid) {
    const action = {
        index: null,
        type: ActionType.requested,
        threadId: bid.threadId,
        event: bid.event,
        payload: bid.payload
    };
    return action;
}

export function getNextActionFromRequests(requestBids: BidsForBidType, waitBids?: EventMap<Bid[]>): Action | undefined {
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
