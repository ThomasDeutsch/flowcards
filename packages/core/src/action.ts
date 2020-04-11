/* eslint-disable @typescript-eslint/no-explicit-any */

import * as utils from "./utils";
import { BidArrayDictionary } from "./bid";


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
    eventName: string;
    payload?: any;
}


export function getNextActionFromRequests(requestBids: BidArrayDictionary): Action | null {
    const eventNames = Object.keys(requestBids);
    if (eventNames.length > 0) {
        const chosenEventName = utils.getRandom(eventNames);
        const bids = requestBids[chosenEventName];
        const bid = bids[bids.length - 1];
        let payload = bid.payload;
        if (typeof payload === "function") {
            payload = payload();
        }
        const isGuarded = bid.guard ? !bid.guard(payload) : false;
        if(isGuarded) {
            delete requestBids[chosenEventName];
            return getNextActionFromRequests(requestBids);
        }
        return {
            type: ActionType.requested,
            threadId: bid.threadId,
            eventName: bid.eventName,
            payload: payload,
        };
    }
    return null;
}
