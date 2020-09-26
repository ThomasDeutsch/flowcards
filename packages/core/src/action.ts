import { Bid, BidsByType, isBlocked, BidType, getBidsForTypes, hasValidMatch } from './bid';
import { EventId } from './event-map';
import * as utils from './utils';

import { BThreadId } from './bthread';

export const GET_VALUE_FROM_BTHREAD: unique symbol = Symbol('getValueFromBThread')

export enum ActionType {
    requested = "requested",
    ui = "ui",
    resolved = "resolved",
    rejected = "rejected"
}

export interface Action {
    id: number | null;
    type: ActionType;
    bThreadId: BThreadId;
    event: EventId;
    payload?: any;
    resolveLoopIndex?: number | null;
    resolve?: {
        isResolvedExtend: boolean;
        requestLoopIndex: number;
        requestDuration: number;  
    };
}

function isValidRequest(bidsByType: BidsByType, bid: Bid): boolean {
    if(isBlocked(bidsByType, bid.event, bid)) return false
    if(bid.type === BidType.trigger) {
        return hasValidMatch(bidsByType, BidType.wait, bid.event, bid) || hasValidMatch(bidsByType, BidType.on, bid.event, bid);
    }
    return true;
}

function getActionFromBid(bid: Bid): Action {
    const action = {
        id: null,
        type: ActionType.requested,
        bThreadId: bid.bThreadId,
        event: bid.event,
        payload: bid.payload
    };
    return action;
}

export function getNextActionFromRequests(bidsByType: BidsByType): Action | undefined {
    const bids = getBidsForTypes(bidsByType, [BidType.request, BidType.set, BidType.trigger]);
    if(bids === undefined) return undefined;
    let [selectedBid, rest] = utils.getRandom(bids);
    while(selectedBid) {
        if(isValidRequest(bidsByType, selectedBid)) {
            return getActionFromBid(selectedBid);
        }
        [selectedBid, rest] = utils.getRandom(rest);
    }
    return undefined; 
}
