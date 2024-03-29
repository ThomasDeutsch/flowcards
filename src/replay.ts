import { ExternalAction, RejectPendingRequestAction, RequestedAction, RequestedAsyncAction, ResolvePendingRequestAction } from "./action";
import { AccumulatedValidationResults, explainAnyBidPlacedByFlow, explainBlocked, explainExactRequestBidPlacedByFlow, explainHighestPriorityAskFor, explainNoPendingRequest, explainPendingExtend, explainPendingRequest, explainValidation, InvalidActionExplanation } from "./action-explain";
import { ActionReactionLogger } from "./action-reaction-logger";
import { EventInformation, PlacedRequestBid, RequestingBidsAndEventInformation } from "./bid";
import { reactToExternalAction, reactToRejectAction, reactToRequestedAction, reactToRequestedAsyncAction, reactToResolveAsyncAction } from "./flow-reaction";
import { isThenable } from "./utils";

export type ReplayRequestAsyncAction<P> = (Omit<RequestedAsyncAction<P>, 'payload'> & {payload?: ((current?: P) => Promise<P>) | '__%TAKE_PAYLOAD_FROM_BID%__', resolveRejectAction? : {resolveActionId? : number, rejectActionId?: number}})

export interface SavedReplay {
    id: string;
    parentReplayIds?: string[];
    actions: ReplayAction<any>[];
}

export interface Replay extends SavedReplay {
    parentReplays?: Replay[]; // Loaded Replays will include all parent replays
}


/** a replay action has an optional payload
 * If the payload is not defined, than the payload will be taken from the current bid, if it is a requested action.
 */
export type ReplayAction<P> =
    RequestedAction<P> |
    ReplayRequestAsyncAction<P> |
    ExternalAction<P> & {id: number} |
    ResolvePendingRequestAction<P> & {id: number} |
    RejectPendingRequestAction & {id: number}

export type ActiveReplayState = 'running' | 'paused' | 'aborted' | 'completed' | undefined;

export type ActiveReplayInfo = {
    state: ActiveReplayState
    //TODO: add test for action
    //TODO: pause replay
}


/**
 * a replay is a list of actions that can be replayed.
 * recorded actions can be event-sourced to restore the state of the application.
 */
export class ActiveReplay {
    private _actions = new Map<number, ReplayAction<any>>();
    private _state: ActiveReplayState;
    private _lastActionId = 0; // the action id of the last action in the replay
    private _actionReactionLogger: ActionReactionLogger;
    private readonly _replay?: Replay;
    private _getBids?: () => RequestingBidsAndEventInformation;
    private _currentAction?: ReplayAction<any>;

    constructor(actionReactionLogger: ActionReactionLogger, replay?: Replay, getBids?: () => RequestingBidsAndEventInformation) {
        this._replay = replay;
        this._getBids = getBids;
        this._actionReactionLogger = actionReactionLogger;
        if(this._replay === undefined || replay?.actions.length === 0) {
            this._state = undefined;
            return;
        }
        const actions = getAllReplayActions(this._replay);
        actions.forEach(action => {
            this._actions.set(action.id, action);
            this._lastActionId = action.id;
        });
        this._state = 'running';
    }

    private _abortReplay(): false {
        this._state = 'aborted';
        return false;
    }

    private _isInvalidAction(invalidActionExplanation?: InvalidActionExplanation): boolean {
        if(invalidActionExplanation) {
            this._actionReactionLogger.logInvalidAction(invalidActionExplanation);
            console.error('replay aborted, because of an invalid action', invalidActionExplanation);
            console.log('failed action: ', this._currentAction);
            console.log('current bids: ', this._getBids?.());
            this._abortReplay();
            return true;
        }
        return false;
    }

    private _isInvalidPayload(results?: AccumulatedValidationResults<any>): boolean {
        if(results !== undefined) {
            this._actionReactionLogger.logPayloadValidations(results);
        }
        if(results?.isValidAccumulated === false) {
            console.error('replay aborted, because of an invalid action payload', results);
            this._abortReplay();
        }
        return results?.isValidAccumulated !== true;
    }

    public getNextReplayAction<P, V>(info: RequestingBidsAndEventInformation, nextActionId: number): boolean {
        if(this._state !== 'running') {
            return false
        }
        if (nextActionId > this._lastActionId) {
            this._state = 'completed';
            return false;
        }
        const nextAction = this._actions.get(nextActionId) as ReplayAction<P> | undefined;
        if (nextAction === undefined) {
            return false;
        }
        this._currentAction = nextAction; // for logging purposes
        const maybeEventInfo = info.eventInformation.get(nextAction.eventId) as EventInformation<P, V> | undefined;
        if(this._isInvalidAction(explainAnyBidPlacedByFlow(nextAction.eventId, maybeEventInfo))) return false;
        const eventInfo = maybeEventInfo as EventInformation<P, V>; // guaranteed to be defined because of the previous isValid check
        if(nextAction.type === 'external') {
            if(this._isInvalidAction(explainBlocked(eventInfo))) return false;
            if(this._isInvalidAction(explainPendingRequest(eventInfo))) return false;
            if(this._isInvalidAction(explainHighestPriorityAskFor(eventInfo, nextAction))) return false;
            const askForBid = eventInfo.askFor[0]; // is guaranteed to be defined because of the previous validation
            if(this._isInvalidAction(explainPendingExtend(eventInfo, askForBid))) return false;
            if(this._isInvalidPayload(explainValidation(eventInfo, nextAction.payload, [askForBid]))) return false;
            reactToExternalAction(eventInfo, {...nextAction, id: nextActionId}, askForBid);
            this._actionReactionLogger.onActionProcessed({...nextAction, id: nextActionId});
            return true;
        }
        // replay a requested action
        if(nextAction.type === 'requested') {
            const requestBid = eventInfo.request[0];
            if(this._isInvalidAction(explainExactRequestBidPlacedByFlow(requestBid, {event: eventInfo.event, type: 'request', flowId: nextAction.flowId, id: nextAction.bidId}))) return false;
            if(this._isInvalidAction(explainBlocked(eventInfo))) return false;
            if(this._isInvalidAction(explainPendingRequest(eventInfo))) return false;
            if(this._isInvalidAction(explainPendingExtend(eventInfo, requestBid))) return false;
            const highestPriorityAskForBid = eventInfo.askFor[0]; // guaranteed because of the previous check.
            if(requestBid.onlyWhenAskedFor) {
                if(this._isInvalidPayload(explainValidation(eventInfo, nextAction.payload, [requestBid, highestPriorityAskForBid]))) return false;
            }
            if(nextAction.payload === '__%TAKE_PAYLOAD_FROM_BID%__') {
                let payloadFromBid: P;
                if(requestBid.payload instanceof Function) {
                    const payloadFunctionResult = requestBid.payload(eventInfo.event.value);
                    if(isThenable(payloadFunctionResult)) {
                        this._isInvalidAction({
                            eventId: requestBid.event.id,
                            message: `the payload of the request bid should not be a function that returns a promise (it was at the time of creation of this replay)`
                        });
                        return false;
                    }
                    payloadFromBid = payloadFunctionResult;
                } else {
                    payloadFromBid = requestBid.payload;
                }
                nextAction.payload = payloadFromBid;
            }
            if(this._isInvalidPayload(explainValidation(eventInfo, nextAction.payload, [requestBid]))) return false;
            reactToRequestedAction(eventInfo, nextAction, requestBid, highestPriorityAskForBid);
            this._actionReactionLogger.onActionProcessed(nextAction);
            return true;
        }
        // replay a requested async action
        if(nextAction.type === 'requestedAsync') {
            const requestBid = eventInfo.request[0];
            if(this._isInvalidAction(explainExactRequestBidPlacedByFlow(requestBid, {event: eventInfo.event, type: 'request', flowId: nextAction.flowId, id: nextAction.bidId}))) return false;
            if(this._isInvalidAction(explainBlocked(eventInfo))) return false;
            if(this._isInvalidAction(explainPendingRequest(eventInfo))) return false;
            if(this._isInvalidAction(explainPendingExtend(eventInfo, requestBid))) return false;
            // use the resolved
            if(nextAction.resolveRejectAction) {
                const resolveActionId = nextAction.resolveRejectAction.resolveActionId;
                if(resolveActionId !== undefined) {
                    const resolveAction = this._actions.get(resolveActionId);
                    if(resolveAction === undefined || !('payload' in resolveAction)) {
                        this._isInvalidAction({
                            eventId: requestBid.event.id,
                            message: `a resolve action with id '${resolveActionId}' is expected, but no resolve action or payload was found.`
                        });
                        return false;
                    }
                    const requestAsyncAction = {...nextAction, payload: new Promise<P>(() => null)}
                    reactToRequestedAsyncAction(eventInfo, requestAsyncAction, requestBid);
                    this._actionReactionLogger.onActionProcessed(requestAsyncAction);
                    return true;
                }
                const rejectActionId = nextAction.resolveRejectAction.rejectActionId;
                if(rejectActionId !== undefined) {
                    const rejectAction = this._actions.get(rejectActionId);
                    if(rejectAction === undefined || !('payload' in rejectAction)) {
                        this._isInvalidAction({
                            eventId: requestBid.event.id,
                            message: `a reject action with id '${rejectActionId}' is expected, but no reject action or payload was found.`
                        });
                        return false;
                    }
                    const rejectAsyncAction = {...nextAction, payload: new Promise<P>(() => null)}
                    reactToRequestedAsyncAction(eventInfo, rejectAsyncAction, requestBid);
                    this._actionReactionLogger.onActionProcessed(rejectAsyncAction);
                    return true;
                }
            }
            // use an alternative payload
            if(nextAction.payload instanceof Function) {
                const payload = nextAction.payload(eventInfo.event.value);
                if(!isThenable(payload)) {
                    this._isInvalidAction({
                        eventId: requestBid.event.id,
                        message: `the alternative payload for a requestAsync action should be a function that returns a promise.`
                    });
                    return false;
                }
                // remove a resolve action if it exists
                if(nextAction.resolveRejectAction?.resolveActionId !== undefined) {
                    this._actions.delete(nextAction.resolveRejectAction?.resolveActionId);
                }
                // remove a reject action if it exists
                if(nextAction.resolveRejectAction?.rejectActionId !== undefined) {
                    this._actions.delete(nextAction.resolveRejectAction?.rejectActionId);
                }
                const requestAsyncAction = {...nextAction, payload};
                reactToRequestedAsyncAction(eventInfo, requestAsyncAction, requestBid);
                this._actionReactionLogger.onActionProcessed(requestAsyncAction);
                return true;
            }
            // use the payload from the request bid
            if(nextAction.payload === '__%TAKE_PAYLOAD_FROM_BID%__') {
                const maybeFunction = eventInfo.request[0].payload;
                if(!(maybeFunction instanceof Function)) {
                    this._isInvalidAction({
                        eventId: requestBid.event.id,
                        message: `the payload of this request bid was expected to contain a function that returns a promise`
                    });
                    return false;
                }
                const payload = maybeFunction(eventInfo.event.value);
                if(!isThenable(payload)) {
                    this._isInvalidAction({
                        eventId: requestBid.event.id,
                        message: `the payload of this request bid was expected to contain a function that returns a promise`
                    });
                    return false;
                }
                const requestAsyncAction = {...nextAction, payload}
                reactToRequestedAsyncAction(eventInfo, requestAsyncAction, requestBid);
                this._actionReactionLogger.onActionProcessed(requestAsyncAction);
                return true;
            }
        }
        if(nextAction.type === 'resolvePendingRequest') {
            if(this._isInvalidAction(explainNoPendingRequest(eventInfo, nextAction))) return false;
            const pendingRequest = eventInfo.pendingRequest as PlacedRequestBid<P,V>; // is a pending request because of the explainHasPendingRequest validation check
            if(this._isInvalidPayload(explainValidation(eventInfo, nextAction.payload, [pendingRequest]))) return false
            reactToResolveAsyncAction(eventInfo, {...nextAction, id: nextActionId}, pendingRequest);
            this._actionReactionLogger.onActionProcessed({...nextAction, id: nextActionId});
            return true;
        }
        if(nextAction.type === 'rejectPendingRequest') {
            if(this._isInvalidAction(explainNoPendingRequest(eventInfo, nextAction))) return false;
            const pendingRequest = eventInfo.pendingRequest as PlacedRequestBid<P,V>; // is a pending request because of the explainHasPendingRequest validation check
            reactToRejectAction(pendingRequest.flow, eventInfo.event);
            this._actionReactionLogger.onActionProcessed({...nextAction, id: nextActionId});
            return true;
        }
        return false;
    }

    /**
     * @internal
     * get the current replay state
     * @returns the current replay state
     */
    get state(): ActiveReplayState {
        return this._state;
    }
}



/**
 * @internal
 * Returns all actions from a replay and all parent replays.
 * @param replay the replay to get the actions from
 * @returns an array of all actions from the replay and all parent replays
 **/
function getAllReplayActions(replay: Replay): ReplayAction<any>[] {
    const actions = [...replay.actions];
    // if there are parent replays, prepent the actions from those replays to the actions array
    if(replay.parentReplays) {
        for(const parentReplay of replay.parentReplays) {
            actions.unshift(...getAllReplayActions(parentReplay));
        }
    }
    return actions;
}
