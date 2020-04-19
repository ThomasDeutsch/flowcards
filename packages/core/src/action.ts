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
    eventId: string;
    payload?: any;
}

export function getNextActionFromRequests(requestBids: BidsForBidType): Action | null {
    const eventIds = Object.keys(requestBids);
    if(eventIds.length === 0) return null;
    const selectedeventId = utils.getRandom(eventIds);
    const bids = requestBids[selectedeventId];
    const bid = bids[bids.length - 1];
    return {
        type: ActionType.requested,
        threadId: bid.threadId,
        eventId: bid.event.id,
        payload: bid.payload,
    };
}
