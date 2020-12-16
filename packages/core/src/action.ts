import { Bid, BidsByType, isBlocked, BidType, getActiveBidsForSelectedTypes, hasValidMatch, getNextBidAndRemaining } from './bid';
import { EventId } from './event-map';
import { BThreadId } from './bthread';
import { validateRequestAction } from './action-test';

export const GET_VALUE_FROM_BTHREAD: unique symbol = Symbol('getValueFromBThread')

export enum ActionType {
    request = "request",
    ui = "ui",
    resolve = "resolve",
    reject = "reject"
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
        requestActionId: number;
        requestDuration: number;  
    };
    bidType?: BidType;
}


export function getActionFromBid(bid: Bid): Action {
    const action = {
        id: null,
        type: ActionType.request,
        bThreadId: bid.bThreadId,
        eventId: bid.eventId,
        payload: bid.payload,
        bidType: bid.type
    };
    return action;
}
