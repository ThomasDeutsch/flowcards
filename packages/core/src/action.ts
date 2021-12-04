import { AllPlacedBids, BufferAction, EventMap, Logger, PlacedBid } from '.';
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


export function getNextRequestedAction(eventMap: EventMap, allPlacedBids: AllPlacedBids, nextActionId: number, logger?: Logger): RequestedAsyncAction | RequestedAction | TriggeredAction | undefined {
     let action: RequestedAsyncAction | RequestedAction | TriggeredAction | undefined;
     const reasons = [];
     allPlacedBids.orderedRequestingBids.some((bid) => {
         const event = eventMap.get(bid.eventId);
         if(event?.isConnected !== true) {
             reasons.push({bid: bid, type:  "eventNotConnected"});
             return false;
         }
         if(allPlacedBids.blockBid.has(bid.eventId)) {
            reasons.push({bid: bid, type: "eventBlockedBy", bThreadIds: allPlacedBids.blockBid.get(bid.eventId)?.map(bid => bid.bThreadId)});
             return false;
         }
         if(event.isPending) {
             reasons.push({bid: bid, type: "eventPendingBy", bThreadId: event.pendingRequestInfo?.bThreadId});
             return false;
         }
         let askForBids: PlacedBid[] | undefined;
         if(bid.type === 'triggerBid') {
             askForBids = allPlacedBids.askForBid.get(bid.eventId);
             if(askForBids === undefined) {
                reasons.push({bid: bid, type: "noAskForForTrigger", bThreadId: event.pendingRequestInfo?.bThreadId});
                return false;
             }
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
         reasons.push({bid: bid, type: 'invalid payload'});
         return false;
     });
     return action;
 }
