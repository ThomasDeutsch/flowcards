import { AllPlacedBids, BidType, BufferAction, EventMap, Logger, PlacedBid } from '.';
import { NameKeyId } from './name-key-map';
import { isThenable } from './utils';
import { getAllPayloadValidationCallbacks, isValidPayload, validateDispatch, ValidationResults } from './validation';

export type ActionType = "requestedAction" | "uiAction" | "resolveAction" | "rejectAction" | "resolvedExtendAction" | "requestedAsyncAction" | "triggeredAction";
export type AnyAction = UIAction | RequestedAction | ResolveAction | ResolveExtendAction | RejectAction | TriggeredAction | RequestedAsyncAction;

interface Action {
    id: number;
    type: ActionType;
    eventId: NameKeyId;
    bThreadId: NameKeyId;
    payload?: unknown;
}

export type DispatchResultCB = (value: ValidationResults<any, any>) => void;
export interface UIAction extends Action {
    type: "uiAction";
    dispatchResultCB?: DispatchResultCB;
}

export interface RequestedAction extends Action {
    type: "requestedAction";
}

export interface RequestedAsyncAction extends Action {
    type: "requestedAsyncAction";
    resolveActionId?: number;
}

export interface TriggeredAction extends Action {
    type: "triggeredAction";
}

export interface ResolveAction extends Action {
    type: 'resolveAction';
    requestActionId: number;
}

export interface ResolveExtendAction extends Action {
    type: "resolvedExtendAction";
    extendedActionType: ActionType;
}

export interface RejectAction extends Action {
    type: "rejectAction";
    requestActionId: number;
    payload: undefined;
    error: any;
}

export function getQueuedAction(actionQueue: BufferAction[], eventMap: EventMap,  nextActionId: number): BufferAction | undefined {
    const action = actionQueue.shift();
    if(action === undefined) return undefined;
    const event = eventMap.get(action.eventId);
    if(event === undefined)  {
        return getQueuedAction(actionQueue, eventMap, nextActionId);
    }
    if(action.type === 'uiAction') {
        // TODO: do not validate if action has the same dispatch-id as the current loop-index.
        const validationResults = validateDispatch(action.payload, event);
        action.dispatchResultCB!(validationResults);
        if(validationResults.isValid) {
            return {...action, id: nextActionId};
        } else {
            // todo: log
            return getQueuedAction(actionQueue, eventMap, nextActionId);
        }
    }
    if(action.type === 'resolveAction') {
        if(event.pendingRequestInfo?.actionId !== action.requestActionId) {
            console.warn('event was canceled')
            // TODO: log.
        }
        return {...action, id: nextActionId};
    }
    if(action.type === 'resolvedExtendAction') {
        // todo: validate: extendingBThread is still there
        return {...action, id: nextActionId};
    }
    if(action.type === 'rejectAction') {
        // todo: ignore blocked & pending for validation
        return {...action, id: nextActionId};
    }
    return getQueuedAction(actionQueue, eventMap, nextActionId);
}



export interface RequestSelectReason {
    event: NameKeyId,
    bidType: BidType,
    type: 'EventNotConnected' | 'EventBlockedBy' | 'EventPendingBy' | 'EventNotAskedFor' | 'BidPayloadInvalid' | 'OK',
    bThreadIds?: NameKeyId[]
}

export function getNextRequestedAction(eventMap: EventMap, allPlacedBids: AllPlacedBids, nextActionId: number, logger: Logger, replayActionPayload?: {value: unknown}): RequestedAsyncAction | RequestedAction | TriggeredAction | undefined {
    let action: RequestedAsyncAction | RequestedAction | TriggeredAction | undefined;
    const reasons: RequestSelectReason[] = [];
    allPlacedBids.orderedRequestingBids.some((bid) => {
        const reason: RequestSelectReason = { event: bid.eventId, bidType: bid.type, type: 'OK' };
        const event = eventMap.get(bid.eventId);
        if(event?.isConnected !== true) {
            reason.type = "EventNotConnected";
            reasons.push(reason);
            return false;
        }
        if(allPlacedBids.blockBid.has(bid.eventId)) {
            reason.type = "EventBlockedBy";
            reason.bThreadIds = allPlacedBids.blockBid.get(bid.eventId)?.map(bid => bid.bThreadId);
            reasons.push(reason);
            return false;
        }
        if(event.isPending) {
            reason.type = "EventPendingBy";
            reason.bThreadIds = [event.pendingBy!];
            reasons.push(reason);
            return false;
        }
        let askForBids: PlacedBid[] | undefined;
        if(bid.type === 'triggerBid') {
            askForBids = allPlacedBids.askForBid.get(bid.eventId);
            if(askForBids === undefined) {
                reason.type = "EventNotAskedFor";
                reasons.push(reason);
                return false;
            }
        }
        if(replayActionPayload !== undefined) {
            bid.payload = replayActionPayload.value;
        }
        else if(typeof bid.payload === "function") {
            bid.payload = bid.payload();
            if(isThenable(bid.payload)) {
                action = {
                    eventId: event.id,
                    id: nextActionId,
                    bThreadId: bid.bThreadId,
                    type: 'requestedAsyncAction',
                    payload: bid.payload
                }
                return true;
            }
        }
        const validateBids = allPlacedBids.validateBid.get(bid.eventId) || [];
        const requestedBy = allPlacedBids[bid.type].get(bid.eventId)!;
        const validationCallbacks = getAllPayloadValidationCallbacks([...requestedBy, ...validateBids, ...(askForBids || [])]);
        const allBidsHaveValidPayload = isValidPayload(validationCallbacks, bid.payload);
        if(allBidsHaveValidPayload) {
            if(bid.type === 'triggerBid') {
                action = {
                    eventId: event.id,
                    id: nextActionId,
                    bThreadId: bid.bThreadId,
                    type: 'triggeredAction',
                    payload: bid.payload
                }
            } else if(bid.type === 'requestBid') {
                action = {
                    eventId: event.id,
                    id: nextActionId,
                    bThreadId: bid.bThreadId,
                    type: 'requestedAction',
                    payload: bid.payload
                }
            }
            return true;
        }
        reason.type = "BidPayloadInvalid";
        reasons.push(reason);
        return false;
    });
    logger.logReasonsForSelectedRequestBid(reasons);
    return action;
 }
