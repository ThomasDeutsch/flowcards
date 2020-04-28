/* eslint-disable @typescript-eslint/no-explicit-any */

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
}

export function getNextActionFromRequests(requestBids: BidsForBidType): Action | undefined {
    if(!requestBids) return undefined;
    const events = requestBids.getAllEvents();
    if(!events) return undefined;
    const selectedEvent = utils.getRandom(events);
    const bids = requestBids.get(selectedEvent);
    const bid = bids![bids!.length - 1]; // select the bid with the highest priority.
    return {
        type: ActionType.requested,
        threadId: bid.threadId,
        event: bid.event,
        payload: bid.payload,
    };
}
