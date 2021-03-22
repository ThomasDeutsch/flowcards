import { BidType, RequestingBidType} from './bid';
import { EventId } from './event-map';
import { BThreadId } from './bthread';
import { ExtendContext } from './extend-context';
import { BThread, PendingBid, PlacedBid, PlacedRequestingBid } from '.';

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
    payload?: any;
}

export interface UIAction extends Action {
    id?: number,
    type: ActionType.UI,
    eventId: EventId;
    payload?: any;
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
    extendedRequestingBid?: PlacedBid;
}

export function isResolveAction(action: AnyAction): action is ResolveAction {
    return action.hasOwnProperty('requestingBThreadId');
}

export function notUIAction(action: AnyAction): action is RequestedAction | ResolveAction | ResolveExtendAction {
    return action.hasOwnProperty('requestingBThreadId');
}

export function isRequestedAction(action: AnyAction): action is RequestedAction {
    return action.type === ActionType.requested;
}

export type AnyAction = UIAction | RequestedAction | ResolveAction | ResolveExtendAction;

export type ReplayAction = Required<UIAction> | Required<RequestedAction> | Required<ResolveAction> | Required<ResolveExtendAction>;

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