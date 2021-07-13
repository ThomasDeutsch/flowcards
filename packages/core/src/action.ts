import { RequestingBidType, PlacedRequestingBid} from './bid';
import { EventId } from './event-map';
import { BThreadId } from './bthread';
import { PendingBid } from './pending-Bid';
import { BidType } from '.';

export type ActionType = "requestedAction" | "uiAction" | "resolveAction" | "rejectedAction" | "resolvedExtendAction";

interface Action {
    eventId: EventId;
    payload?: unknown;
}
export interface UIAction extends Action {
    id?: number,
    type: "uiAction",
    eventId: EventId;
    payload?: unknown;
}

export interface RequestedAction extends Action {
    id: number,
    type: "requestedAction",
    bidType: RequestingBidType;
    bThreadId: BThreadId;
    resolveActionId?: number | 'pending';
}

export interface ResolveAction extends Action {
    id?: number,
    type: "resolveAction" | "rejectAction";
    requestActionId: number;
    pendingDuration: number;
    resolvedRequestingBid: {type: BidType, bThreadId: BThreadId};
}

export interface ResolveExtendAction extends Action {
    id?: number,
    type: "resolvedExtendAction";
    pendingDuration: number;
    requestActionId: number;
    extendingBThreadId: BThreadId;
    extendedRequestingBid?: {type: BidType, bThreadId: BThreadId};
}

interface ResolveActionWithId extends ResolveAction {
    id: number;
}

interface ResolveExtendActionWithId extends ResolveExtendAction {
    id: number;
}

interface UiActionWithId extends UIAction {
    id: number;
}


export type AnyAction = UIAction | RequestedAction | ResolveAction | ResolveExtendAction;
export type AnyActionWithId = ResolveActionWithId | ResolveExtendActionWithId | UiActionWithId | RequestedAction;


export function toActionWithId(action: AnyAction, id: number): AnyActionWithId {
    if(action.id !== undefined) return action as AnyActionWithId;
    return {id: id, ...action};
}


export function getRequestedAction(currentActionId: number, bid?: PlacedRequestingBid): RequestedAction | undefined {
    if(bid === undefined) return undefined;
    return {
        id: currentActionId,
        type: "requestedAction",
        bidType: bid.type as RequestingBidType,
        bThreadId: bid.bThreadId,
        eventId: bid.eventId,
        payload: bid.payload
    };
}


export function getResolveAction(responseType: "rejectAction" | "resolveAction", pendingBid: PendingBid, data: unknown): ResolveAction {
    return {
        id: undefined,
        type: responseType,
        eventId: pendingBid.eventId,
        payload: data,
        requestActionId: pendingBid.actionId,
        pendingDuration: new Date().getTime() - pendingBid.startTime,
        resolvedRequestingBid: {type: pendingBid.type, bThreadId: pendingBid.bThreadId}
    }
}


export function getResolveExtendAction(pendingBid: PendingBid, data: unknown): ResolveExtendAction {
    return {
        id: undefined,
        type: "resolvedExtendAction",
        eventId: pendingBid.eventId,
        payload: data,
        extendingBThreadId: pendingBid.bThreadId,
        requestActionId: pendingBid.actionId,
        pendingDuration: new Date().getTime() - pendingBid.startTime,
        extendedRequestingBid: pendingBid.extendedRequestingBid
    }
}
