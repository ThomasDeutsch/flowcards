import { Bid, BidsByType, isBlocked, BidType, getActiveBidsForSelectedTypes, hasValidMatch, getNextBidAndRemaining, extend } from './bid';
import { EventId } from './event-map';

import { BThreadId } from './bthread';

export const GET_VALUE_FROM_BTHREAD: unique symbol = Symbol('getValueFromBThread')

export enum ActionType {
    requested = "requested",
    ui = "ui",
    resolved = "resolved",
    rejected = "rejected",
    extended = "extended"
}

export interface Action {
    id: number | null;
    type: ActionType;
    bThreadId: BThreadId;
    eventId: EventId;
    payload?: any;
    resolveActionId?: number | null; 
    resolve?: {
        isResolvedExtend: boolean;
        requestLoopIndex: number;
        requestDuration: number;  
    };
    bidType?: BidType;
}

function isValidRequest(bidsByType: BidsByType, bid: Bid): boolean {
    if(isBlocked(bidsByType, bid.eventId, bid)) return false;
    if(bid.type === BidType.trigger) {
        return hasValidMatch(bidsByType, BidType.askFor, bid.eventId, bid) || hasValidMatch(bidsByType, BidType.on, bid.eventId, bid);
    }
    return true;
}

function getActionFromBid(bid: Bid): Action {
    const action = {
        id: null,
        type: ActionType.requested,
        bThreadId: bid.bThreadId,
        eventId: bid.eventId,
        payload: bid.payload,
        bidType: bid.type
    };
    return action;
}

export function getNextActionFromRequests(activeBidsByType: BidsByType): Action | undefined {
    const bids = getActiveBidsForSelectedTypes(activeBidsByType, [BidType.request, BidType.set, BidType.trigger]);
    if(bids === undefined) return undefined;
    let [nextBid, restBids] = getNextBidAndRemaining(bids);
    while(nextBid) {
        if(isValidRequest(activeBidsByType, nextBid)) {
            return getActionFromBid(nextBid);
        }
        [nextBid, restBids] = getNextBidAndRemaining(restBids);
    }
    return undefined; 
}
