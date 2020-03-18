/* eslint-disable @typescript-eslint/no-explicit-any */

import * as utils from "./utils";
import { BidArrayDictionary } from "./bid";


export enum ActionType {
    request = "request",
    resolve = "resolve",
    reject = "reject",
    waited = "waited",
    init = "init"
}

export interface Action {
    type: ActionType;
    threadId?: string;
    eventName: string;
    payload?: any;
    isPromise?: boolean;
}


export function getNextActionFromRequests(requestBids: BidArrayDictionary): Action | null {
    const eventNames = Object.keys(requestBids);
    if (eventNames.length > 0) {
        const chosenEventName = utils.getRandomString(eventNames);
        const bids = requestBids[chosenEventName];
        if (bids.length > 1) {
            throw new Error(`event '${chosenEventName}' was requested by ${bids.length} threads at the same time: '${bids
                .map((b): string => b.threadId)
                .join(", ")}'. Make sure to use distinct event names.`);
        } else {
            const bid = bids[0];
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
                type: ActionType.request,
                threadId: bid.threadId,
                eventName: bid.eventName,
                payload: payload,
                isPromise: utils.isThenable(payload)
            };
        }
    }
    return null;
}
