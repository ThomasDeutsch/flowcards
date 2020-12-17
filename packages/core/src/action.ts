import { Bid, BidType} from './bid';
import { EventId } from './event-map';
import { BThreadId } from './bthread';


export const GET_VALUE_FROM_BTHREAD: unique symbol = Symbol('getValueFromBThread')


export enum ActionType {
    requested = "requested",
    uiDispatched = "uiDispatched",
    resolved = "resolved",
    rejected = "rejected"
}


export interface Action {
    id: number | null;
    type: ActionType;
    bThreadId: BThreadId;
    eventId: EventId;
    payload?: any;
    resolveActionId?: number | null; 
    resolve?: {
        requestActionId: number;
        requestDuration: number;  
    };
    bidType?: BidType;
}


export function getActionFromBid(bid?: Bid): Action | undefined {
    if(bid === undefined) return undefined;
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
