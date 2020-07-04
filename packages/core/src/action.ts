import * as utils from "./utils";
import { BidsForBidType } from "./bid";
import { FCEvent } from './event';

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

export function getNextActionFromRequests(requestBids: BidsForBidType, waitBids: BidsForBidType): Action | undefined {
    if(!requestBids) return undefined;
    const events = requestBids.allEvents;
    if(!events) return undefined;
    let action;
    let [selectedEvent, rest] = getRandom(events);
    while(selectedEvent && !action) {
        const bids = requestBids.get(selectedEvent);
        if(!rest && !bids) return undefined;
        const bid = bids[bids.length - 1]; // select the bid with the highest priority.
        action = {
            type: ActionType.requested,
            threadId: bid.threadId,
            event: bid.event,
            payload: bid.payload,
            cacheEnabled: bid.cacheEnabled
        };
        
        [selectedEvent, rest] = getRandom(events);
    }
    return action;
    
}
