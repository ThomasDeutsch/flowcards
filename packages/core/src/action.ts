import { RequestingBidType, PlacedBid, PlacedRequestingBid} from './bid';
import { EventId } from './event-map';
import { BThreadId } from './bthread';
import { PendingBid } from './pending-bid';


export const GET_VALUE_FROM_BTHREAD: unique symbol = Symbol('getValueFromBThread')


export enum ActionType {
    requested = "requested",
    UI = "UI",
    resolved = "resolved",
    rejected = "rejected",
    extended = "extended",
    resolvedExtend = "resolvedExtend"
}


interface Action {
    type: ActionType;
    eventId: EventId;
    payload?: unknown;
}


export interface UIAction extends Action {
    id?: number,
    type: ActionType.UI,
    eventId: EventId;
    payload?: unknown;
}


export interface RequestedAction extends Action {
    id: number,
    type: ActionType.requested,
    bidType: RequestingBidType;
    bThreadId: BThreadId;
    resolveActionId?: number | "notResolved" | "checkPayloadForPromise";
}


export interface ResolveAction extends Action {
    id?: number,
    type: ActionType.resolved | ActionType.rejected;
    requestingBThreadId: BThreadId;
    requestActionId: number;
    pendingDuration: number;
}


export interface ResolveExtendAction extends Action {
    id?: number,
    type: ActionType.resolvedExtend;
    pendingDuration: number;
    requestActionId: number;
    extendedRequestingBid: PlacedBid;
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
        type: ActionType.requested,
        bidType: bid.type as RequestingBidType,
        bThreadId: bid.bThreadId,
        eventId: bid.eventId,
        payload: bid.payload,
        resolveActionId: 'checkPayloadForPromise'
    };
}


export function getResolveAction(responseType: ActionType.rejected | ActionType.resolved, pendingBid: PendingBid, pendingDuration: number, data: unknown): ResolveAction {
    return {
        id: undefined,
        type: responseType,
        requestingBThreadId: pendingBid.bThreadId,
        eventId: pendingBid.eventId,
        payload: data,
        requestActionId: pendingBid.actionId,
        pendingDuration: pendingDuration
    }
}


export function getResolveExtendAction(pendingBid: PendingBid, extendedBid: PlacedBid, pendingDuration: number, data: unknown): ResolveExtendAction {
    return {
        id: undefined,
        type: ActionType.resolvedExtend,
        eventId: pendingBid.eventId,
        payload: data,
        requestActionId: pendingBid.actionId,
        pendingDuration: pendingDuration,
        extendedRequestingBid: extendedBid
    }
}


export function getRequestingBid(action: AnyAction): PlacedBid | undefined {
    if(action.type === ActionType.requested) {
        return {
            bThreadId: action.bThreadId,
            type: action.bidType,
            eventId: action.eventId
        }
    }
    return undefined;
}