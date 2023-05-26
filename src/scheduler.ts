import { ExternalAction, RejectPendingRequestAction, ResolvePendingRequestAction } from "./action.ts";
import { Event } from "./event.ts";
import { Flow, FlowGeneratorFunction } from "./flow.ts";
import { ActiveReplay, Replay } from "./replay.ts";
import { ActionAndReactions, ActionReactionLogger } from "./action-reaction-logger.ts";
import { processNextValidRequestBid } from "./process-request.ts";
import { processAction } from "./process-action.ts";
import { EventRecord, getAllEvents } from "./utils.ts";
import { InvalidBidReasons, invalidReasonsForRequestBid } from "./bid-invalid-reasons.ts";
import { OrderedRequestsAndCurrentBids, Placed, RequestBid, getOrderedRequestsAndCurrentBids } from "./bid.ts";

// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

/**
 * a callback function that is called if the current scheduler run is finished (all actions processed, and no more requests that can be processed)
 */
 //export type SchedulerCompletedCallback = (actionAndReactions: ActionAndReactions[], orderedRequestsAndCurrentBids: OrderedRequestsAndCurrentBids, activeReplayInfo: ActiveReplayInfo) => void;

/**
 * properties of the Scheduler
 * @param rootFlowGeneratorFunction the root generator function
 * @param schedulerRunsCompletedCallback callback function that is called if an action was processed by the scheduler
 * @param replay the replay object that is used to record and replay the scheduler process
 */
export interface SchedulerProps {
    id: string;
    rootFlow: FlowGeneratorFunction;
    events: EventRecord;
    actionReactionGenerator?: Generator<void, void, ActionAndReactions>;
    replay?: Replay;
}

/**
 * the flowcards scheduler is the main class of the library.
 * It is responsible for processing and finding the next valid action.
 * After all actions are processed, the scheduler will call the schedulerRunsCompletedCallback.
 */
export class Scheduler {
    private _rootFlow: Flow;
    private _orderedRequestsAndCurrentBids: OrderedRequestsAndCurrentBids
    private _actionReactionLogger = new ActionReactionLogger();
    private actionReactionGenerator?: Generator<void, void, ActionAndReactions>;
    private _activeReplay: ActiveReplay;
    private _currentActionId = -1;
    private _changedEvents: Map<string, Event<any,any>> = new Map();
    private _currentlyValidatedEvent?: Event<any, any>;
    private _events: Event<any, any>[];

    constructor(props : SchedulerProps) {
        this._actionReactionLogger = new ActionReactionLogger();
        this.actionReactionGenerator = props.actionReactionGenerator;
        this._rootFlow = new Flow({
            pathFromRootFlow: [props.id],
            generatorFunction: props.rootFlow,
            executeAction: this._run.bind(this),
            logger: this._actionReactionLogger,
            registerChangedEvent: this._registerChangedEvent.bind(this),
            parameters: []
        });
        this._events = getAllEvents(props.events);
        this._events.forEach(event => this._connectEvent(event));
        this._activeReplay = new ActiveReplay(this._actionReactionLogger, props.replay, () => this._orderedRequestsAndCurrentBids);
        this._orderedRequestsAndCurrentBids = getOrderedRequestsAndCurrentBids(this._rootFlow.__getBidsAndPendingInformation());
        this.actionReactionGenerator?.next();
        this._run();
    }

    /**
     * register changed events (value changes and changes to the other states: pending, blocked, ...) during the current scheduler run.
     * @param event the event that has changed
     */
    private _registerChangedEvent(event: Event<any,any>): void {
        this._changedEvents.set(event.id, event);
    }

    /**
     * toggle the registration of events that are accessed during a bid-validate function call.
     * This is used to determine what events a bid (validation) is depending on
     * The goal is to update the event if one of the depending events has changed.
     * For example: Update the validation if one of the depending events has changed in the UI.
     * @param event the event for which the validate function is called.
     */
    private _toggleEventAccessRegistrationInValidateFunction(event: Event<any, any>): void {
        if(this._currentlyValidatedEvent?.id === event.id) {
            this._currentlyValidatedEvent = undefined;
        } else {
            this._currentlyValidatedEvent = event;
        }
    }

    /**
     * register an event access when a bid-validate function is called.
     * This is used to determine what a bid is depending on (what events).
     * @param event the event that is accessed
     */
    private _registerEventAccessInValidateFunction(event: Event<any, any>): void {
        if(this._currentlyValidatedEvent === undefined) return
        event.__addRelatedValidationEvent(this._currentlyValidatedEvent)
    }

    /**
     * function to connect an event to the scheduler
     * @param event the event that will be connected to the scheduler, to be able to access the scheduler functionality.
     */
    private _connectEvent(event: Event<any, any>): void {
        event.__connectToScheduler({
            rootFlowId: this._rootFlow.id,
            getCurrentBids: (eventId: string) => this._orderedRequestsAndCurrentBids.currentBidsByEventId.get(eventId),
            registerEventAccess: this._registerEventAccessInValidateFunction.bind(this),
            toggleValueAccessLogging: this._toggleEventAccessRegistrationInValidateFunction.bind(this),
            startSchedulerRun: this._run.bind(this)
        });
    }

    /**
     * This function is the main-function for the flowcards library.
     * It will process the next action from 3 possible sources ( ordered by priority ):
     * 1. a replay action (from a running replay)
     * 2. a resolved/rejected request or from an external source.
     * 3. a request bid (from any flow that placed a request bid)
     * If the action was processed, the next bids are collected and the run function is called again.
     * This is done, until no more actions can be processed.
     * After this function call, all events that have changed are updated.
     * @param action the external/resolve/reject action that will be processed
     */
    private _run(action?: ExternalAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction): void {
        const nextActionId = this._currentActionId + 1;
        const wasActionProcessed =
            this._activeReplay.processNextReplayAction(this._orderedRequestsAndCurrentBids, nextActionId) ||
            processAction(this._orderedRequestsAndCurrentBids, nextActionId, this._actionReactionLogger, action) ||
            processNextValidRequestBid(this._orderedRequestsAndCurrentBids, nextActionId, this._actionReactionLogger);
        if(wasActionProcessed) {
            this._currentActionId = nextActionId;
            this._orderedRequestsAndCurrentBids = getOrderedRequestsAndCurrentBids(this._rootFlow.__getBidsAndPendingInformation());
            this.actionReactionGenerator?.next(this._actionReactionLogger.getActionsAndReactions());
            this._run();
        }
        else {
            this._changedEvents.forEach(event => event.__triggerUpdateCallback(this._currentActionId));
            this._changedEvents.clear();
            this.actionReactionGenerator?.next(this._actionReactionLogger.getActionsAndReactions());
        }
    }

    /**
     * for a given request bid, return the invalid reasons for the bid.
     * @param bid the request bid that will be checked
     * @returns the invalid reasons for the bid or the validation results if the bid is invalid
     */
    public explainRequestBid<P,V>(bid: Placed<RequestBid<P,V>>): InvalidBidReasons | undefined {
        const currentBids = this._orderedRequestsAndCurrentBids.currentBidsByEventId.get(bid.event.id);
        const invalidBidReasons = invalidReasonsForRequestBid(bid, currentBids);
        return invalidBidReasons
    }

    public getOrderedRequestsAndCurrentBids(): OrderedRequestsAndCurrentBids {
        return Object.freeze(this._orderedRequestsAndCurrentBids);
    }
}