import { BidType, RequestingBidType} from './bid';
import { EventId } from './event-map';
import { BThreadId } from './bthread';
import { ExtendContext } from './extend-context';
import { BThread, PlacedRequestingBid } from '.';

export const GET_VALUE_FROM_BTHREAD: unique symbol = Symbol('getValueFromBThread')

export enum ActionType {
    requested = "requested",
    UI = "UI",
    resolved = "resolved",
    rejected = "rejected",
    extended = "extended"
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
    requestingBThreadId: BThreadId;
    bidType: RequestingBidType;
    resolveActionId: number | "notResolved" | 'checkPayloadForPromise';
}

export interface ExtendAction extends Action {
    id: number,
    type: ActionType.requested,
    requestingBThreadId: BThreadId;
    bidType: BidType.extend;
    resolveActionId: number | "notResolved";
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
    type: ActionType.resolved;
    requestingBThreadId: BThreadId;
    requestActionId: number;
    pendingDuration: number;
    extendedAction: AnyAction;  
}

export function isResolveExtendAction(action: AnyAction): action is ResolveExtendAction {
    return action.hasOwnProperty('extendedAction');
}

export type AnyAction = UIAction | RequestedAction | ResolveAction | ResolveExtendAction;

export type ReplayAction = Required<UIAction> | Required<RequestedAction> | Required<ResolveAction> | Required<ResolveExtendAction>;

export function getRequestedAction(currentActionId: number, bid?: PlacedRequestingBid): RequestedAction | undefined {
    if(bid === undefined) return undefined;
    return {
        id: currentActionId,
        type: ActionType.requested,
        bidType: bid.type as RequestingBidType,
        requestingBThreadId: bid.bThreadId,
        eventId: bid.eventId,
        payload: bid.payload,
        resolveActionId: 'checkPayloadForPromise'
    };
}

export function getExtendedAction(extendedAction: AnyAction, extendContext: ExtendContext, extendingBThread: BThread): ExtendAction {
    return {
        id: extendedAction.id!,
        type: ActionType.requested,
        requestingBThreadId: extendingBThread.id,
        resolveActionId: 'notResolved',
        bidType: BidType.extend,
        eventId: extendedAction.eventId,
        payload: extendContext.promise
    }
}

export function getResponseAction(responseType: ActionType.rejected | ActionType.resolved, requestedAction: RequestedAction, requestDuration: number, data: unknown, extendedAction?: AnyAction): ResolveAction | ResolveExtendAction {
    const responseAction: ResolveAction = {
        id: requestedAction.resolveActionId === 'notResolved' || requestedAction.resolveActionId === 'checkPayloadForPromise' ? undefined : requestedAction.resolveActionId,  // for replay. what action-id will be the resolve id.
        type: responseType,
        requestingBThreadId: requestedAction.requestingBThreadId,
        eventId: requestedAction.eventId,
        payload: data,
        requestActionId: requestedAction.id,
        pendingDuration: requestDuration
    }
    if(extendedAction) {
        return {...responseAction, extendedAction: extendedAction} as ResolveExtendAction;
    }
    return responseAction
}
