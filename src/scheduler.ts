import { Action, ExternalAction, RejectPendingRequestAction, ResolvePendingRequestAction } from "./action";
import { EventInformation, updateEventInformation, RequestingBidsAndEventInformation } from "./bid";
import { Event } from "./event";
import { Flow, FlowGeneratorFunction } from "./flow";
import { reactToExternalAction, reactToRejectAction, reactToResolveAsyncAction } from "./flow-reaction";
import { ActiveReplay, ActiveReplayInfo, Replay } from "./replay";
import { ActionProcessedInformation, ActionReactionLogger } from "./action-reaction-logger";
import { processNextValidRequestBid } from "./process-request";
import { processAction } from "./process-action";

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

//TODO: how to handle multiple stores?
// like handling multiple root flows?


/**
 * the flowcards scheduler is the main class of the library.
 * It is responsible for processing and finding the next valid action.
 * After all actions are processed, the scheduler will call the schedulerRunsCompletedCallback.
 */
export class Scheduler {
    private _rootFlow: Flow;
    private _bidsAndEventInfo: RequestingBidsAndEventInformation;
    private _actionReactionLogger = new ActionReactionLogger();
    private _schedulerCompletedCallback?: SchedulerCompletedCallback;
    private _activeReplay: ActiveReplay;
    private _currentActionId = -1;
    private _changedEvents: Map<string, Event<any,any>> = new Map();

    constructor(props : SchedulerProps) {
        this._actionReactionLogger = new ActionReactionLogger();
        this._schedulerCompletedCallback = props.completedCB;
        this._rootFlow = new Flow({
            id: 'rootFlow',
            generatorFunction: props.rootFlow,
            executeAction: this._run.bind(this),
            logger: this._actionReactionLogger,
            parameters: []
        });
        this._activeReplay = new ActiveReplay(this._actionReactionLogger, props.replay, () => this._bidsAndEventInfo);
        this._bidsAndEventInfo = updateEventInformation(this._connectEvent.bind(this), this._rootFlow.__getBidsAndPendingInformation());
        this._run();
    }

    /**
     * @internal
     * register changed events (value changes and changes to the other states: pending, blocked, ...) during the current scheduler run.
     * @param event the event that has changed
     */
    public registerChangedEvent(event: Event<any,any>): void {
        this._changedEvents.set(event.id, event);
    }

    /**
     * function to connect an event to the scheduler
     * @param event the event that will be to the scheduler
     */
    private _connectEvent(event: Event<any, any>): void {
        event.__connectToScheduler((eventId: string) => this._bidsAndEventInfo.eventInformation.get(eventId), this._run.bind(this), this._actionReactionLogger);
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
            this._activeReplay.processNextReplayAction(this._bidsAndEventInfo, nextActionId) ||
            processAction(this._bidsAndEventInfo, nextActionId, this._actionReactionLogger, action) ||
            processNextValidRequestBid(this._bidsAndEventInfo, nextActionId, this._actionReactionLogger);
        if(wasActionProcessed) {
            this._currentActionId = nextActionId;
            this._bidsAndEventInfo = updateEventInformation(this._connectEvent.bind(this), this._rootFlow.__getBidsAndPendingInformation());
            this._run();
        }
        else {
            const logs = this._actionReactionLogger.flushLog();
            this._changedEvents.forEach(event => event.__triggerUpdateCallback(this._currentActionId));
            this._changedEvents.clear();
            this._schedulerCompletedCallback?.(logs, Object.freeze(this._bidsAndEventInfo), {state: this._activeReplay.state});
        }
    }
}