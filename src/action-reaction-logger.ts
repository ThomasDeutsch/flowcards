import { Action } from "./action";
import { AccumulatedValidationResults } from "./payload-validation";
import { Event } from "./event";
import { ReplayAction } from "./replay";
import { appendTo, mapValues } from "./utils";
import { Placed, RequestBid } from "./bid";

// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

/**
 * information collection of a scheduler run.
 */
 export interface ActionProcessedInformation {
    invalidActionExplanations?: InvalidActionExplanation[];
    validationResults?: AccumulatedValidationResults<any>;
    processedAction?: ReplayAction<any>;
    flowReactions?: Map<string, {type: FlowReactionType, details: FlowReactionDetails}[]>;
}

/**
 * @internal
 * the action/reaction log is used to collect information about all scheduler runs - until no more action is processed.
 * it is used to collect information about:
 *  1. if an action is ok to process -> if not, the invalid explanation will be set.
 *  2. if an action had a valid payload or not -> if not, the validation results will be set.
 *  3. reactions from the flows are collected
 *  4. the finished processed action is logged (all flows have reacted to the action)
 *  5. the changed events are logged (this information is used to determine what events need to be updated)
 */
export class ActionReactionLogger {
    private _logs: ActionProcessedInformation[] = []; // the log of all scheduler runs
    private _currentRun: ActionProcessedInformation = {}; // the current scheduler run
    private _accessedValuesFrom?: Event<any, any>; // the events that have been accessed during the between the events "start value access logging" and "stop value access logging

    constructor() {}

    /**
     * @internal
     * logs an invalid action explanation to the current scheduler run.
     * This function adds all actions to the log that will not be processed.
     * If an external action is dropped, the callback will be called with the explanation.
     * @param invalidActionExplanation
     * @param externalActionProcessedCallback
     */
    public logInvalidAction(invalidActionExplanation?: InvalidActionExplanation): void {
        if(invalidActionExplanation) {
            this._currentRun.invalidActionExplanations = appendTo(this._currentRun.invalidActionExplanations, invalidActionExplanation);
        }
    }

    public logInvalidRequestBid(bid: Placed<RequestBid<any, any>>, invalidReason: InvalidRequestBidReason): void {
        this._currentRun.invalidActionExplanations = appendTo(this._currentRun.invalidActionExplanations, {bidId, invalidReason});
    }

    /**
     * @internal
     * logs the validation results of an action to the current scheduler run.
     * @param validationResults the validation results of an action
     * @param externalActionProcessedCallback the callback that is called if an external action is dropped
     */
    public logPayloadValidations(payloadValidations: AccumulatedValidationResults<any>): void {
        this._currentRun.validationResults = payloadValidations;
    }

    /**
     * @internal
     * log a reaction of a flow to the current scheduler run.
     * @param flowId  the id of the flow
     * @param reactionType  the type of the reaction
     */
    public logFlowReaction(flowId: string, reactionType: FlowReactionType, details: FlowReactionDetails) {
        if(this._currentRun.flowReactions === undefined) {
            this._currentRun.flowReactions = new Map<string, {type: FlowReactionType, details: FlowReactionDetails}[]>();
        }
        //this._currentRun.flowReactions.update(flowId, (reactions) => [...(reactions ?? []), reactionType]);
        this._currentRun.flowReactions.set(flowId, appendTo(this._currentRun.flowReactions.get(flowId), {type: reactionType, details}));

    }

    /**
     * @internal
     * logs the processed action to the current scheduler run.
     * @param action the processed action
     * @param externalActionProcessedCallback the callback that is called if an external action is dropped
     */
    public onActionProcessed(action: Action<any> & {id: number}): void {
        if(action.type === 'requestedAsync') {
            this._currentRun.processedAction = {...action, payload: '__%TAKE_PAYLOAD_FROM_BID%__'};
        }
        else {
            this._currentRun.processedAction = {...action};
        }
        this._logs.push({...this._currentRun});
        this._currentRun = {};
    }

    /**
     * @internal
     * logs the changed events (value changes and changes to the other states: pending, blocked, ...)
     * @param changedEvents
     */
    public logChangedEvent(event: Event<any,any>): void {
        this._changedEvents.set(event.id, event);
    }

    /**
     * @internal
     * the log of all scheduler runs
     * @internalRemarks this is used by the scheduler to get the latest log for the latest scheduler run(s)
     */
    public flushLog(): {logs: ActionProcessedInformation[], changedEvents: Event<any,any>[]} {
        const logs = [...this._logs];
        this._logs = [];
        const changedEvents = mapValues(this._changedEvents);
        this._changedEvents = new Map();
        return {changedEvents, logs};
    }

    /**
     * @internal
     * logs the events that are accessed in a validation function of an event.
     * @param event the event that has a value accessed
     */
    public logEventAccess(event: Event<any, any>): void {
        if(this._accessedValuesFrom === undefined) return
        event.__addRelatedValidationEvent(this._accessedValuesFrom);
    }

    /**
     * @internal
     * starts the logging of the events that are used in a validation function of this event.
     * @param event the event that has its validation function called.
     */
    public startValueAccessLogging(event: Event<any,any>): void {
        this._accessedValuesFrom = event;
    }

    /**
     * @internal
     * stops the logging of the events that are requesting a value
     */
    public stopValueAccessLogging(): void {
        this._accessedValuesFrom = undefined;
    }
}