import { BufferedQueue } from './buffered-queue';
import { Logger } from './logger';
import { EventMap, GetEvent } from './scheduler';
import { NameKeyId } from './name-key-map';
import { isThenable } from './utils';
import { Staging } from './staging';
import { explainAskFor, ExplainEventResult, explainRequest, explainResolve, explainTrigger } from './guard';


export type ActionType = "requestedAction" | "uiAction" | "resolveAction" | "rejectAction" | "resolvedExtendAction" | "requestedAsyncAction" | "triggeredAction";
export type QueueAction = UIAction | ResolveAction | RejectAction | ResolveExtendAction;
export type ActionFromBid = RequestedAction | TriggeredAction | RequestedAsyncAction;
export type AnyAction = QueueAction | ActionFromBid;

interface Action {
    id: number;
    type: ActionType;
    eventId: NameKeyId;
    payload?: any;
    flowId: NameKeyId;
    bidId: number;
}

export interface UIAction extends Action {
    type: "uiAction";
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
    askForBid: {flowId: NameKeyId, bidId: number}
}

export interface ResolveAction extends Action {
    type: 'resolveAction';
    requestActionId: number;
}

export interface ResolveExtendAction extends Action {
    type: "resolvedExtendAction";
    extendedActionType: ActionType;
    askForBid?: {flowId: NameKeyId, bidId: number}
}

export interface RejectAction extends Action {
    type: "rejectAction";
    requestActionId: number;
    error: ExplainEventResult<any>;
}

export function isActionFromBid(action: AnyAction): boolean {
    return (action.type === 'requestedAction' || action.type === 'requestedAsyncAction' || action.type === 'triggeredAction');
}

export function getQueuedAction(logger: Logger, actionQueue: BufferedQueue<QueueAction>, eventMap: EventMap, staging: Staging, nextActionId: number): QueueAction | undefined {
    const action = actionQueue.get;
    if(action === undefined) return undefined;
    const event = eventMap.get(action.eventId);
    if(event === undefined)  {
        throw new Error('event not connected');
    }
    if(action.type === 'uiAction') {
        // TODO: do not validate if action has the same dispatch-id as the current loop-index.
        const explain = explainAskFor(event, action.payload);
        event.__queueValidationResult(explain);
        logger.logExplain(explain);
        if(explain.isValid) {
            return {...action, id: nextActionId};
        }  else {
            //TODO: log dropped action
            return getQueuedAction(logger, actionQueue, eventMap, staging, nextActionId);
        }
    }
    if(action.type === 'resolveAction') {
        const explain = explainResolve(event, action.payload);
        logger.logExplain(explain);
        if(!explain.isValid) {
            const rejectAction: RejectAction = {
                ...action,
                type: 'rejectAction',
                error: explain,
                payload: action.payload
            }
            return rejectAction;
        }
        const flow = staging.getFlow(action.flowId);
        if(flow === undefined) {
            logger.logCanceledPending(action.flowId, action.eventId, 'request', 'flow disabled');
        } else {
            return {...action, id: nextActionId};
        }
    }
    if(action.type === 'resolvedExtendAction') {
        return {...action, id: nextActionId};
    }
    if(action.type === 'rejectAction') {
        return {...action, id: nextActionId};
    }
    logger.logDroppedAction(action);
    return getQueuedAction(logger, actionQueue, eventMap, staging, nextActionId);
}


// TODO: implement Replay behaviour
export function getNextRequestedAction(getEvent: GetEvent, staging: Staging, nextActionId: number, logger: Logger, payloadOverride?: {value: any}): ActionFromBid | undefined {
    let action: RequestedAsyncAction | RequestedAction | TriggeredAction | undefined;
    staging.orderedRequestingBids?.some((bid) => {
        let explain: ExplainEventResult<any>;
        if(bid.type === 'requestBid') {
            const event = getEvent(bid.eventId);
            explain = explainRequest(event, bid);
            logger.logExplain(explain);
            if(explain.isValid === false) {
                return false;
            }
            if(isThenable(explain.nextValue)) {
                action = {
                    eventId: bid.eventId,
                    id: -1,
                    flowId: bid.flowId,
                    type: 'requestedAsyncAction',
                    payload: explain.nextValue,
                    bidId: bid.id
                }
                return true;
            }
            else {
                action = {
                    eventId: bid.eventId,
                    id: -1,
                    flowId: bid.flowId,
                    type: 'requestedAction',
                    payload: explain.nextValue,
                    bidId: bid.id
                }
                return true;
            }
        }
        else {
            const event = getEvent(bid.eventId);
            explain = explainTrigger(event, bid);
            logger.logExplain(explain);
            if(explain.isValid === false) {
                return false;
            }
            action = {
                eventId: bid.eventId,
                id: -1,
                flowId: bid.flowId,
                type: 'triggeredAction',
                askForBid: explain.askForBid!,
                payload: explain.nextValue,
                bidId: bid.id
            }
            return true;
        }
    })
    return action ? {...action, id: nextActionId} : undefined;
 }
