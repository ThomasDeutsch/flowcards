import { ExternalAction, RejectPendingRequestAction, ResolvePendingRequestAction } from "./action.ts";
import { Event } from "./event.ts";
import { Flow, FlowGeneratorFunction } from "./flow.ts";
import { ActionAndReactions, ActionReactionLogger } from "./action-reaction-logger.ts";
import { processNextValidRequestBid } from "./process-request.ts";
import { processAction } from "./process-action.ts";
import { isDefined, mapValues } from "./utils.ts";
import { InvalidBidReason, invalidReasonForRequestBid } from "./bid-invalid-reasons.ts";
import { OrderedRequestsAndCurrentBids, Placed, RequestBid, getOrderedRequestsAndCurrentBids, AskForBid } from "./bid.ts";

// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

/**
 * a callback function that is called if the current engine run is finished (all actions processed, and no more requests that can be processed)
 */
 export type ActionReactionGenerator = Generator<(ExternalAction<any> & {id: number}) | ResolvePendingRequestAction<any> | RejectPendingRequestAction | 'mockRequest' | undefined, void, ActionAndReactions | 'noActionReactionsRecorded' | 'runEnd'>;

/**
 * properties of the Engine
 */
export interface EngineProps {
    id: string;
    rootFlow: FlowGeneratorFunction;
    actionReactionGeneratorFn?: (engine: Engine) => ActionReactionGenerator;
}

/**
 * the flowcards engine is the main class of the library.
 * It is responsible for processing and finding the next valid action.
 * After all actions are processed, the engine will call the schedulerRunsCompletedCallback.
 */
export class Engine {
    private _orderedRequestsAndCurrentBids: OrderedRequestsAndCurrentBids
    private actionReactionGenerator?: ActionReactionGenerator;
    private _currentActionId = -1;
    private _changedEvents: Map<string, Event<any,any>> = new Map();
    private _currentlyValidatedEvent?: Event<any, any>;
    public readonly __actionReactionLogger = new ActionReactionLogger();
    public readonly rootFlow: Flow;

    constructor(props : EngineProps) {
        this.__actionReactionLogger = new ActionReactionLogger();
        this.actionReactionGenerator = props.actionReactionGeneratorFn?.(this);
        this.rootFlow = new Flow({
            pathFromRootFlow: [props.id],
            generatorFunction: props.rootFlow,
            logger: this.__actionReactionLogger,
            registerChangedEvent: this._registerChangedEvent.bind(this),
            runEngine: this.__run.bind(this)
        });
        this._orderedRequestsAndCurrentBids = getOrderedRequestsAndCurrentBids(this);
        this.actionReactionGenerator?.next();
        return this;
    }

    /**
     * register changed events (value changes and changes to the other states: pending, blocked, ...) during the current engine run.
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
     * function to connect an event to the engine
     * @internal
     * @param event the event that will be connected to the engine, to be able to access the engine functionality.
     */
    public __connectEventToEngine(event: Event<any, any>): void {
        event.__connectToEngine({
            rootFlowId: this.rootFlow.id,
            getCurrentBids: (eventId: string) => this._orderedRequestsAndCurrentBids.currentBidsByEventId.get(eventId),
            registerEventAccess: this._registerEventAccessInValidateFunction.bind(this),
            toggleValueAccessLogging: this._toggleEventAccessRegistrationInValidateFunction.bind(this),
            runEngine: this.__run.bind(this)
        });
    }

    /**
     * flag, to prevent recursive calls of the run function
     * @internal
     */
    private _isRunning = false;

    /**
     * @internal
     * This function is the main-function for the flowcards library.
     * It will process the next action from 3 possible sources ( ordered by priority ):
     * 1. a resolved/rejected/external action
     * 2. an external action from the tests
     * 3. a request bid (from any flow that placed a request bid)
     * If the action was processed, the next bids are collected and the run function is called again.
     * This is done, until no more actions can be processed.
     * After this function call, all events that have changed are updated.
     * @param action the external/resolve/reject action that will be processed
     * @throws a recursive call error if the engine is already running
     */
    public __run(externalAction?: ExternalAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction): void {
        if(this._isRunning) {
            throw new Error('recursive call: engine already running');
        }
        this._isRunning = true;
        while(true) {
            let wasActionProcessed: boolean;
            const actionFromTest = this.actionReactionGenerator?.next(this.__actionReactionLogger.getActionAndReactions())?.value;
            if(externalAction !== undefined) {
                wasActionProcessed = processAction(this, externalAction);
                externalAction = undefined;
            }
            else if(typeof actionFromTest === 'object') {
                wasActionProcessed = processAction(this, actionFromTest);
            }
            else {
                wasActionProcessed = processNextValidRequestBid(this, actionFromTest === 'mockRequest');
            }
            if(wasActionProcessed === true) {
                this._currentActionId++;
                this._orderedRequestsAndCurrentBids = getOrderedRequestsAndCurrentBids(this);
            }
            else { break; }
        }
        this._changedEvents.forEach(event => event.__triggerUpdateCallback(this._currentActionId));
        this._changedEvents.clear();
        this.actionReactionGenerator?.next('runEnd');
        this._isRunning = false;
    }

    /**
     * start the engine
     * initially the engine will process all requests that are placed by the flows.
     */
    public start(): void {
        this.__run();
    }

    /**
     * for a given request bid, return the invalid reasons for the bid.
     * @param bid the request bid that will be checked
     * @returns the invalid reasons for the bid or the validation results if the bid is invalid
     */
    public explainRequestBid<P,V>(bid: Placed<RequestBid<P,V>>): InvalidBidReason | undefined {
        const currentBids = this._orderedRequestsAndCurrentBids.currentBidsByEventId.get(bid.event.id);
        const invalidBidReasons = invalidReasonForRequestBid(bid, currentBids);
        return invalidBidReasons
    }

    /**
     * get the current ordered requests and bids
     * @returns ordered requests and current bids (object is freezed)
     */
    public get orderedRequestsAndCurrentBids(): OrderedRequestsAndCurrentBids {
        return Object.freeze(this._orderedRequestsAndCurrentBids);
    }

    /**
     * get the current askFor bids for all events in a list
     * @returns a list of askFor bids for all events
     */
    public get askForBids(): Placed<AskForBid<any, any>>[] {
        return mapValues(this._orderedRequestsAndCurrentBids.currentBidsByEventId).map(bids => bids.askFor).flatMap(bids => bids).filter(isDefined);
    }

    /**
     * get pending requests for all events in a list
     */
    public get pendingRequests(): Placed<RequestBid<any, any>>[] {
        return mapValues(this._orderedRequestsAndCurrentBids.currentBidsByEventId).map(bids => bids.pendingRequest).flatMap(bids => bids).filter(isDefined);
    }

    /**
     * get open requests for all events in a list
     * @returns a list of invalid requests for all events
     */
    public get openRequests(): Placed<RequestBid<any, any>>[] {
        return this._orderedRequestsAndCurrentBids.orderedRequests;
    }

    /**
     * get the current action id
     * @returns the current action id
     */
    public get currentActionId(): number {
        return this._currentActionId;
    }
}