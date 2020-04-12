/* eslint-disable @typescript-eslint/no-explicit-any */

import * as utils from "./utils";
import { BidsForBidType } from "./bid";


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

export function getNextActionFromRequests(requestBids: BidsForBidType): Action | null {
    const eventNames = Object.keys(requestBids);
    if(eventNames.length === 0) return null;
    const selectedEventName = utils.getRandom(eventNames);
    const bids = requestBids[selectedEventName];
    const bid = bids[bids.length - 1];
    return {
        type: ActionType.requested,
        threadId: bid.threadId,
        eventName: bid.eventName,
        payload: bid.payload,
    };
}
