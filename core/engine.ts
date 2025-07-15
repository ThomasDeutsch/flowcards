import { InputAction, RejectPendingRequestAction, ResolvePendingRequestAction } from "./action.ts";
import { Event } from "./event.ts";
import { Rule, RuleGeneratorFunction } from "./rule.ts";
import { ActionAndReactions, ActionReactionLogger } from "./action-reaction-logger.ts";
import { processNextValidRequestBid } from "./process-request.ts";
import { processAction } from "./process-action.ts";
import { isDefined, mapValues } from "./utils.ts";
import { InvalidBidReason, invalidReasonForRequestBid } from "./bid-invalid-reasons.ts";
import { OrderedRequestsAndCurrentBids, Placed, SetBid, getOrderedRequestsAndCurrentBids, WhenBid } from "./bid.ts";

// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

 export type TestGenerator = Generator<(InputAction<any> & {id: number}) | ResolvePendingRequestAction<any> | RejectPendingRequestAction | 'mockRequest' | undefined, void, ActionAndReactions>;


export interface EngineProps {
    id: string;
    rootRule: RuleGeneratorFunction;
    createTester?: (engine: Engine) => TestGenerator;
}


// CORE FUNCTIONS -----------------------------------------------------------------------------------------------

export class Engine {
    private _orderedRequestsAndCurrentBids: OrderedRequestsAndCurrentBids
    private tester?: TestGenerator;
    private _currentActionId = -1;
    private _changedEvents: Map<string, Event<any,any>> = new Map();
    private _currentlyValidatedEvent?: Event<any, any>;
    private _isRunning = false;
    public readonly __actionReactionLogger = new ActionReactionLogger();
    public readonly rootRule: Rule;

    constructor(props : EngineProps) {
        this.__actionReactionLogger = new ActionReactionLogger();
        this.tester = props.createTester?.(this);
        this.rootRule = new Rule({
            pathFromRootRule: [props.id],
            generatorFunction: props.rootRule,
            logger: this.__actionReactionLogger,
            registerChangedEvent: this._registerChangedEvent.bind(this),
            runEngine: this.run.bind(this)
        });
        this._orderedRequestsAndCurrentBids = getOrderedRequestsAndCurrentBids(this);
        this.tester?.next(); // start the tester
        return this;
    }

    private _registerChangedEvent(event: Event<any,any>): void {
        this._changedEvents.set(event.id, event);
    }

    private _toggleEventAccessRegistrationInValidateFunction(event: Event<any, any>): void {
        if(this._currentlyValidatedEvent?.id === event.id) {
            this._currentlyValidatedEvent = undefined;
        } else {
            this._currentlyValidatedEvent = event;
        }
    }

    private _registerEventAccessInValidateFunction(event: Event<any, any>): void {
        if(this._currentlyValidatedEvent === undefined) return
        event.__addRelatedValidationEvent(this._currentlyValidatedEvent)
    }

    public __connectEventToEngine(event: Event<any, any>): void {
        event.__connectToEngine({
            rootRuleId: this.rootRule.id,
            getCurrentBids: (eventId: string) => this._orderedRequestsAndCurrentBids.currentBidsByEventId.get(eventId),
            registerEventAccess: this._registerEventAccessInValidateFunction.bind(this),
            toggleValueAccessLogging: this._toggleEventAccessRegistrationInValidateFunction.bind(this),
            runEngine: this.run.bind(this)
        });
    }

    public run(inputAction?: InputAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction): void {
        if(this._isRunning) {
            throw new Error('recursive call: engine already running');
        }
        console.log('running engine', inputAction);
        this._isRunning = true;
        if(inputAction) {
            const wasActionProcessed = processAction(this, inputAction);
            if(!wasActionProcessed) throw new Error(`invalid action: ${JSON.stringify(inputAction)}`);
            this._currentActionId++;
            this._orderedRequestsAndCurrentBids = getOrderedRequestsAndCurrentBids(this);
        }
        while(true) {
            let wasActionProcessed: boolean;
            const actionFromTest = this.tester?.next(this.__actionReactionLogger.getActionAndReactions())?.value;
            // process action from a test, or from a request bid
            if(actionFromTest) {
                if(actionFromTest === 'mockRequest') {
                    wasActionProcessed = processNextValidRequestBid(this, true);
                }
                else {
                    wasActionProcessed = processAction(this, actionFromTest)
                }
                if(!wasActionProcessed) {
                    this.tester?.next({...this.__actionReactionLogger.getActionAndReactions(), actionRejected: true});
                    continue;
                }
            }
            else {
                const wasInternalRequestProcessed = processNextValidRequestBid(this);
                if (!wasInternalRequestProcessed) {
                    this.tester?.next({...this.__actionReactionLogger.getActionAndReactions(), hasFinished: true});
                    break;
                }
                wasActionProcessed = true;
            }
            // stay in the loop, or exit
            if(wasActionProcessed === true) {
                this._currentActionId++;
                this._orderedRequestsAndCurrentBids = getOrderedRequestsAndCurrentBids(this);
            } else {
                this.tester?.next({...this.__actionReactionLogger.getActionAndReactions(), hasFinished: true});
                break;
            }
        }
        this._changedEvents.forEach(event => event.__triggerUpdateCallback(this._currentActionId));
        this._changedEvents.clear();
        this._isRunning = false;
    }

    public explainRequestBid<P,V>(bid: Placed<SetBid<P,V>>): InvalidBidReason | undefined {
        const currentBids = this._orderedRequestsAndCurrentBids.currentBidsByEventId.get(bid.event.id);
        const invalidBidReasons = invalidReasonForRequestBid(bid, currentBids);
        return invalidBidReasons
    }

    public get orderedRequestsAndCurrentBids(): OrderedRequestsAndCurrentBids {
        return Object.freeze(this._orderedRequestsAndCurrentBids);
    }

    public get whenBids(): Placed<WhenBid<any, any>>[] {
        return mapValues(this._orderedRequestsAndCurrentBids.currentBidsByEventId).map(bids => bids.when).flatMap(bids => bids).filter(isDefined);
    }

    public get pendingRequests(): Placed<SetBid<any, any>>[] {
        return mapValues(this._orderedRequestsAndCurrentBids.currentBidsByEventId).map(bids => bids.pendingRequest).flatMap(bids => bids).filter(isDefined);
    }

    public get openRequests(): Placed<SetBid<any, any>>[] {
        return this._orderedRequestsAndCurrentBids.orderedRequests;
    }

    public get currentActionId(): number {
        return this._currentActionId;
    }
}