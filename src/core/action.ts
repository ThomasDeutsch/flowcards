import { BidArrayDictionary } from "./bid";
import * as utils from "./utils";

export enum ActionType {
    request = "request",
    resolve = "resolve",
    reject = "reject",
    waited = "waited"
}

export interface Action {
    type: ActionType;
    threadId?: string;
    eventName: string;
    payload?: any;
}

export interface ExternalAction {
    isReplay?: boolean;
    actions: Action[];
}

interface Dictionary<T> {
    [Key: string]: T;
}

export function getNextActionFromRequests(requestBids: BidArrayDictionary): Action | null {
    const eventNames = Object.keys(requestBids);
    if (eventNames.length > 0) {
        const chosenEventName = utils.getRandomString(eventNames);
        const bids = requestBids[chosenEventName];
        if (bids.length > 1) {
            throw new Error(`event '${chosenEventName}' was requested by ${bids.length} threads at the same time: '${bids
                .map(b => b.threadId)
                .join(", ")}'.
      Make sure to use distinct event names.`);
        } else {
            const bid = bids[0];
            let isAborted: boolean = false;
            let payload = bid.payload;
            if (payload && typeof payload === "function") {
                payload = payload({isValid: bid.guard || (() => true), abort: (result: boolean = true) => isAborted = result });
            }
            const isGuarded = bid.guard ? !bid.guard(payload) : false;
            if(isAborted || isGuarded) {
                delete requestBids[chosenEventName];
                return getNextActionFromRequests(requestBids);
            }
            return {
                type: ActionType.request,
                eventName: bid.eventName,
                payload: payload,
                threadId: bid.threadId
            } as Action;
        }
    }
    return null;
}
