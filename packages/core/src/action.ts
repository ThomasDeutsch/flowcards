import { RequestingBidType, PlacedBid, PlacedRequestingBid} from './bid';
import { EventId } from './event-map';
import { BThreadId } from './bthread';
import { PendingBid } from './pending-Bid';


export const GET_VALUE_FROM_BTHREAD: unique symbol = Symbol('getValueFromBThread')
export type ActionType = "requestedAction" | "uiAction" | "resolveAction" | "rejectedAction" | "resolvedExtendAction";

interface Action {
    type: ActionType;
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
    type: "resolveAction" | "rejectedAction";
    requestActionId: number;
    pendingDuration: number;
    resolvedRequestingBid: PlacedBid;
}


export interface ResolveExtendAction extends Action {
    id?: number,
    type: "resolvedExtendAction";
    pendingDuration: number;
    requestActionId: number;
    extendingBThreadId: BThreadId;
    extendedRequestingBid?: PlacedBid;
}


export type AnyAction = UIAction | RequestedAction | ResolveAction | ResolveExtendAction;
type RequireOne<T, K extends keyof T> = T & {[P in K]-?: T[P]};
export type AnyActionWithId = RequireOne<AnyAction, 'id'>;


export function toActionWithId(action: AnyAction, id: number): AnyActionWithId {
    if(action.id !== undefined) return action as AnyActionWithId;
    return {...action, id: id};
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


export function getResolveAction(responseType: "rejectedAction" | "resolveAction", pendingBid: PendingBid, pendingDuration: number, data: unknown): ResolveAction {
    return {
        id: undefined,
        type: responseType,
        eventId: pendingBid.eventId,
        payload: data,
        requestActionId: pendingBid.actionId,
        pendingDuration: pendingDuration,
        resolvedRequestingBid: pendingBid
    }
}


export function getResolveExtendAction(pendingBid: PendingBid, pendingDuration: number, data: unknown): ResolveExtendAction {
    return {
        id: undefined,
        type: "resolvedExtendAction",
        eventId: pendingBid.eventId,
        payload: data,
        extendingBThreadId: pendingBid.bThreadId,
        requestActionId: pendingBid.actionId,
        pendingDuration: pendingDuration,
        extendedRequestingBid: pendingBid.extendedRequestingBid
    }
}


