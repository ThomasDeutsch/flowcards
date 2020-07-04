import { BidsForBidType, Bid } from "./bid";
import { FCEvent, EventMap } from './event';
import { getGuardForWaits } from './guard';


export enum ActionType {
    initial = "initial",
    requested = "requested",
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
    cacheEnabled?: boolean;
}


function getRandom<T>(coll: T[]): [T, T[] | undefined] {
    if (coll.length === 1) return [coll[0], undefined];
    const randomIndex = Math.floor(Math.random() * coll.length);
    const value = coll.splice(randomIndex, 1)[0];
    return [value, coll];
}


function getBid(bids?: Bid[], waitBids?: BidsForBidType): Bid | undefined {
    if(!bids) return undefined;
    const reversedBids = bids.reverse(); // last bid has the highest priority.
    for (const bid of reversedBids) {
        if(bid.onlyRequestWhenWaitedFor) {
            if(waitBids && getGuardForWaits(waitBids, bid.event)?.(bid.payload)) {
                return bid;
            }
        } else {
            return bid;
        }
    }
    return undefined;
}


export function getNextActionFromRequests(requestBids: BidsForBidType, waitBids?: EventMap<Bid[]>): Action | undefined {
    if(!requestBids) return undefined;
    const events = requestBids.allEvents;
    if(!events) return undefined;
    let [selectedEvent, rest] = getRandom(events);
    while(selectedEvent) {
        const bids = requestBids.get(selectedEvent);
        const bid = getBid(bids, waitBids);
        if(bid) return {
            type: ActionType.requested,
            threadId: bid.threadId,
            event: bid.event,
            payload: bid.payload,
            cacheEnabled: bid.cacheEnabled
        };
        [selectedEvent, rest] = getRandom(events);
    }
    return undefined; 
}