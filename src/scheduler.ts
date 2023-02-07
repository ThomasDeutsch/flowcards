import { Action, RejectPendingRequestAction, RequestedAction, RequestedAsyncAction, TriggeredAction } from "./action";
import { EventInformation, updateEventInformation, PlacedRequestBid, PlacedTriggerBid, RequestingBidsAndEventInformation } from "./bid";
import { Event } from "./event";
import { explainAnyBidPlacedByFlow, explainBlocked, explainNoPendingRequest, explainHighestPriorityAskFor, explainPendingExtend, explainPendingRequest, explainValidation, InvalidActionExplanation, AccumulatedValidationResults } from "./action-explain";
import { Flow, FlowGeneratorFunction } from "./flow";
import { isThenable, mapValues } from "./utils";
import { reactToExternalAction, reactToRejectAction, reactToRequestAction, reactToRequestedAsyncAction, reactToResolveAsyncAction, reactToTriggerAction } from "./flow-reaction";
import { ActiveReplay, ActiveReplayInfo, Replay } from "./replay";
import { ActionProcessedInformation, ActionReactionLogger } from "./action-reaction-logger";

// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

/**
 * a callback function that is called if the current scheduler run is finished (all actions processed, and no more requests that can be processed)
 */
 export type SchedulerCompletedCallback = (info: ActionProcessedInformation[], bidsAndEventInfo: RequestingBidsAndEventInformation, activeReplayInfo: ActiveReplayInfo) => void;

/**
 * properties of the Scheduler
 * @param rootFlowGeneratorFunction the root generator function
 * @param schedulerRunsCompletedCallback callback function that is called if an action was processed by the scheduler
 * @param replay the replay object that is used to record and replay the scheduler process
 */
export interface SchedulerProps {
    rootFlow: FlowGeneratorFunction;
    completedCB?: SchedulerCompletedCallback;
    replay?: Replay;
}


// SCHEDULER CLASS ----------------------------------------------------------------------------------------------------

/**
 * a scheduler that takes actions from the action queue and from the bids and processes them
 * the scheduler holds the references to the action queue and the events.
 */
export class Scheduler {
    private _rootFlow: Flow;
    private _bidsAndEventInfo: RequestingBidsAndEventInformation;
    private _actionReactionLogger = new ActionReactionLogger();
    private _schedulerCompletedCallback?: SchedulerCompletedCallback;
    private _activeReplay: ActiveReplay;
    private _currentActionId = -1;

    constructor(props : SchedulerProps) {
        this._actionReactionLogger = new ActionReactionLogger();
        this._schedulerCompletedCallback = props.completedCB;
        let flowName = props.rootFlow.name;
        if(flowName === "anonymous" || flowName === "") {
            flowName = 'root'
        }
        this._rootFlow = new Flow({
            id: flowName,
            generatorFunction: props.rootFlow,
            executeAction: this._run.bind(this),
            logger: this._actionReactionLogger
        });
        this._activeReplay = new ActiveReplay(this._actionReactionLogger, props.replay, () => this._bidsAndEventInfo);
        this._bidsAndEventInfo = updateEventInformation(this._connectEvent.bind(this), this._rootFlow.__getBidsAndPendingInformation());
        this._run();
    }

    /**
     * function to connect an event to the scheduler
     * @param event the event that will be to the scheduler
     */
    private _connectEvent(event: Event<any, any>): void {
        event.__connectToScheduler((eventId: string) => this._bidsAndEventInfo.eventInformation.get(eventId), this._run.bind(this), this._actionReactionLogger);
    }

    /**
     * helper function to check if the action is valid or not. If not, the action is logged as invalid action.
     * @param invalidActionExplanation
     * @param externalActionProcessedCallback
     * @returns true if the action is invalid
     */
    private _isInvalidAction(invalidActionExplanation?: InvalidActionExplanation) {
        if(invalidActionExplanation) {
            this._actionReactionLogger.logInvalidAction(invalidActionExplanation);
            return true;
        }
        return false;
    }

    /**
     * helper function to log validation results and return true if the validation results are all valid
     * @param results
     * @param externalActionProcessedCallback
     * @returns true if the validation results are all valid
     */
    private _isInvalidPayload(results?: AccumulatedValidationResults<any>) {
        if(results !== undefined) {
            this._actionReactionLogger.logPayloadValidations(results);
        }
        return results?.isValidAccumulated !== true;
    }

    /**
     * function to return the next action - if valid
     * @param info the information about bids and pending actions
     * @returns true if an action was processed
     */
    private _processAction<P, V>(info: RequestingBidsAndEventInformation, nextActionId: number, nextAction?: Action<any>): boolean {
        if(nextAction === undefined) return false;
        const maybeEventInfo = info.eventInformation.get(nextAction.eventId) as EventInformation<P, V> | undefined;
        const isInvalid = (expl?: InvalidActionExplanation) => this._isInvalidAction(expl);
        if(isInvalid(explainAnyBidPlacedByFlow(nextAction.eventId, maybeEventInfo))) return false;
        const eventInfo = maybeEventInfo as EventInformation<P, V>; // guaranteed to be defined because of the previous isValid check
        if(nextAction.type === 'external') {
            //if(isInvalid(explainHighestPriorityAskFor(eventInfo, nextAction))) return false;
            const askForBid = eventInfo.askFor[0];
            reactToExternalAction(eventInfo, {...nextAction, id: nextActionId}, askForBid);
            this._actionReactionLogger.onActionProcessed({...nextAction, id: nextActionId});
            return true;
        }
        if(nextAction.type === 'resolvePendingRequest') {
            // check if the pending event info flow & bid are the same! (ignore blocked and pending extend, because the event was already executed)
            if(isInvalid(explainNoPendingRequest(eventInfo, nextAction))) return false;
            const pendingRequest = eventInfo.pendingRequest as PlacedRequestBid<P,V>; // is a pending request because of the explainHasPendingRequest validation check
            if(this._isInvalidPayload(explainValidation(eventInfo, nextAction.payload, [pendingRequest]))) {
                const rejectAction: RejectPendingRequestAction = {
                    id: nextActionId,
                    type: 'rejectPendingRequest',
                    eventId: nextAction.eventId,
                    flowId: nextAction.flowId,
                    bidId: nextAction.bidId,
                    requestActionId: nextAction.requestActionId,
                    error: 'invalid payload'
                };
                reactToRejectAction(pendingRequest.flow, eventInfo.event);
                this._actionReactionLogger.onActionProcessed({...rejectAction, id: nextActionId});
                return true;
            }
            reactToResolveAsyncAction(eventInfo, {...nextAction, id: nextActionId}, pendingRequest);
            this._actionReactionLogger.onActionProcessed({...nextAction, id: nextActionId});
            return true;
        }
        if(nextAction.type === 'rejectPendingRequest') {
            if(isInvalid(explainNoPendingRequest(eventInfo, nextAction))) return false;
            const pendingRequest = eventInfo.pendingRequest as PlacedRequestBid<P,V>; // is a pending request because of the explainHasPendingRequest validation check
            reactToRejectAction(pendingRequest.flow, eventInfo.event);
            this._actionReactionLogger.onActionProcessed({...nextAction, id: nextActionId});
            return true;
        }
        return false;
    }

    /**
     * function to return the next valid action that is created from the first valid requesting bid
     * @param info the information about bids and pending events
     * @returns true if an action was processed
     */
    private _processActionFromBid(info: RequestingBidsAndEventInformation, nextActionId: number): boolean {
        return mapValues(info.requested).some(<P>(bid: PlacedRequestBid<P, unknown> | PlacedTriggerBid<P, unknown>) => {
            const maybeEventInfo = info.eventInformation.get(bid.event.id);
            if(this._isInvalidAction(explainAnyBidPlacedByFlow(bid.event.id, maybeEventInfo))) return false;
            const eventInfo = maybeEventInfo as EventInformation<P, any>; // guaranteed to be defined because of the previous isValid check
            if(this._isInvalidAction(explainBlocked(eventInfo))) return false;
            if(this._isInvalidAction(explainPendingRequest(eventInfo))) return false;
            if(this._isInvalidAction(explainPendingExtend(eventInfo, bid))) return false;
            if(bid.type === 'request') {
                const payload = bid.payload instanceof Function ? bid.payload(bid.event.value) : bid.payload;
                if(isThenable(payload)) {
                    const requestedAsyncAction: RequestedAsyncAction<P> = {
                        id: nextActionId,
                        type: 'requestedAsync',
                        eventId: bid.event.id,
                        payload: payload,
                        bidId: bid.id,
                        flowId: bid.flow.id
                    }
                    reactToRequestedAsyncAction(eventInfo, requestedAsyncAction, bid);
                    this._actionReactionLogger.onActionProcessed(requestedAsyncAction);
                    return true;
                } else {
                    if(this._isInvalidPayload(explainValidation(eventInfo, payload, [bid]))) return false;
                    const requestedAction: RequestedAction<P> = {
                        id: nextActionId,
                        type: 'requested',
                        eventId: bid.event.id,
                        payload: payload,
                        bidId: bid.id,
                        flowId: bid.flow.id
                    };
                    reactToRequestAction(eventInfo, requestedAction, bid);
                    this._actionReactionLogger.onActionProcessed(requestedAction);
                    return true;
                }
            }
            else if(bid.type === 'trigger') {
                const payload = bid.payload instanceof Function ? bid.payload(bid.event.value) : bid.payload;
                // check if the highest priority askFor bid is valid
                if(this._isInvalidAction(explainHighestPriorityAskFor(eventInfo))) return false;
                const highestPriorityAskForBid = eventInfo.askFor[0]; // guaranteed because of the previous check.
                if(this._isInvalidPayload(explainValidation(eventInfo, payload, [bid, highestPriorityAskForBid]))) return false;
                const triggeredAction: TriggeredAction<P> = {
                    id: nextActionId,
                    type: 'triggered',
                    eventId: bid.event.id,
                    payload: bid.payload as P,
                    bidId: bid.id,
                    flowId: bid.flow.id
                };
                reactToTriggerAction(eventInfo, triggeredAction, bid, highestPriorityAskForBid);
                this._actionReactionLogger.onActionProcessed({...triggeredAction, id: nextActionId});
                return true;
            }
            return false;
        })
    }

    /**
     * This function is the main-function for the flowcards library.
     * A function to process the next action from 3 possible sources ( ordered by priority ):
     * 1. a replay action
     * 2. from the currently executed action (an ExternalAction, that was triggered by the UI/External-System)
     * 3. a requesting bid ( a PlacedRequestBid or PlacedTriggerBid )
     * If the action was processed, the next bids are collected and the run function is called again.
     * This is done, until no more actions can be processed. This marks the end of a microtask.
     */
    private _run(action?: Action<any>): void {
        const nextActionId = this._currentActionId + 1;
        const wasActionProcessed =
            this._activeReplay.getNextReplayAction(this._bidsAndEventInfo, nextActionId) ||
            this._processAction(this._bidsAndEventInfo, nextActionId, action) ||
            this._processActionFromBid(this._bidsAndEventInfo, nextActionId);
        if(wasActionProcessed) {
            this._currentActionId = nextActionId;
            this._bidsAndEventInfo = updateEventInformation(this._connectEvent.bind(this), this._rootFlow.__getBidsAndPendingInformation());
            this._run();
        }
        else {
            const {changedEvents, logs} = this._actionReactionLogger.flushLog();
            changedEvents.forEach(event => event.__triggerUpdateCallback(this._currentActionId));
            this._schedulerCompletedCallback?.(logs, Object.freeze(this._bidsAndEventInfo), {state: this._activeReplay.state});
        }
    }

    /**
     * getter for the root flow
     * @returns the root flow
     */
    get rootFlow(): Flow {
        return this._rootFlow;
    }
}