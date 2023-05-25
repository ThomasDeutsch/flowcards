import { ExternalAction, RejectPendingRequestAction, ResolvePendingRequestAction } from "./action";
import { toBids, filterRemainingBids, Placed, RequestBid, AnyBid } from "./bid";
import { Event } from  "./event";
import { ActionReactionLogger } from "./action-reaction-logger";
import { areDepsEqual, isThenable, mergeMaps } from "./utils";
import { isProgressingBid } from "./bid-utility-functions";


// INTERFACES -------------------------------------------------------------------------------------------------------------

/**
 * type used for the iterator result of a flow generator
 * a flow generators next value can return a bid or an array of bids.
 * if a flow places the same bid again, it is a PlacedBid.
 */
export type TNext = AnyBid<any, any> | Placed<AnyBid<any, any>> | (AnyBid<any, any> | Placed<AnyBid<any, any>>)[] | undefined;

/**
 * The progress info contains information about the latest progression of this flow.
 * The information contains the latest progressed event and the remaining bids for this flow.
*/
export type FlowProgressInfo = [Event<unknown>, Placed<AnyBid<unknown, unknown>>[] | undefined];

/**
 * a generator function returns a flow-generator that is bound to the flow
 */
export type FlowGenerator = Generator<TNext, void, FlowProgressInfo>;
export type FlowGeneratorFunction = (this: Flow, ...parameters: any[]) => FlowGenerator;

/**
 * @internal
 * iterator result of a flow generator
 */
type FlowIteratorResult = IteratorResult<TNext | undefined, void>;

/**
 * all parameters needed to create a flow
 */
export interface FlowParameters {
    pathFromRootFlow: string[];
    generatorFunction: FlowGeneratorFunction;
    executeAction: (action: ExternalAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction) => void;
    registerChangedEvent: (event: Event<any, any>) => void;
    logger: ActionReactionLogger;
    parameters: any[];
}

/**
 * information about the flow bids and pending events
 */
export interface AllBidsAndPendingInformation {
    placedBids: Placed<AnyBid<any, any>>[];
    pendingRequests?: Map<string, Placed<RequestBid<any, any>>>;
    pendingExtends?: Map<string, PendingExtend<any, any>>;
}

/**
 * all needed information about a pending extend
 */
 export interface PendingExtend<P, V> {
    value?: P | Promise<P>;
    event: Event<P,V>;
    extendingFlow: Flow;
    extendedBids: Placed<AnyBid<P, V>>[];
}

/**
 * a flow is a wrapper for a generator function.
 * a flow is able to place bids and react to actions.
 */
export class Flow {
    private readonly _generatorFunction: FlowGeneratorFunction;
    private _generator: FlowGenerator;
    private _children: Map<string, Flow> = new Map();
    private _hasEnded = false;
    private _currentBidId = 0;
    private _isDisabled = false;
    private _placedBids: Placed<AnyBid<unknown, unknown>>[] | undefined;
    private _pendingRequests: Map<string, Placed<RequestBid<any, any>>> = new Map();
    private _pendingExtends: Map<string, PendingExtend<any, any>> = new Map();
    private _executeAction: (action: ExternalAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction) => void;
    private _registerChangedEvent: (event: Event<any, any>) => void;
    private _latestActionIdThisFlowProgressedOn?: number;
    private _logger: ActionReactionLogger;
    private _currentParameters?: any[];
    private _onCleanupCallback?: () => void;
    public readonly pathFromRootFlow: string[];

    constructor(parameters: FlowParameters) {
        // this initialization is only done once
        this.pathFromRootFlow = parameters.pathFromRootFlow;
        this._generatorFunction = parameters.generatorFunction.bind(this);
        this._executeAction = parameters.executeAction;
        this._logger = parameters.logger;
        this._currentParameters = parameters.parameters;
        this._registerChangedEvent = parameters.registerChangedEvent;
        this._resetToInitial();
        this._generator = this._generatorFunction(...(this._currentParameters || []));
        try {
            this._handleNext.bind(this)(this._generator.next());
            this._logger.__logFlowReaction(this.pathFromRootFlow, 'flow enabled', {});
        } catch(error) {
            console.error('first .next call in constructor exited with an error: ', this.id, ': ', error, '.flow will be ended');
            this.__end();
        }
    }

    // PRIVATE -------------------------------------------------------------------------------------------

    /**
     * place the next bids of this flow
     * @param next the iterator result of the generator
     * @internalRemarks mutates: ._currentBidId, ._placedBids
     */
    private _placeBids(nextBids?: (AnyBid<any, any> | Placed<AnyBid<any, any>>)[]): void {
        const nextPlacedBids = nextBids?.map(bid => {
            if('id' in bid) {
                return {...bid, flow: this, id: bid.id} as Placed<AnyBid<any, any>>;
            }
            else {
                if(bid.type === 'askFor' || bid.type === 'validate' || bid.type === 'block') {
                    this._registerChangedEvent(bid.event);
                }
                return {...bid, flow: this, id: this._currentBidId++} as Placed<AnyBid<any, any>>;
            }
        });
        // get all bids that are no longer placed
        this._placedBids?.forEach((placedBid) => {
            const isRemoved = !nextPlacedBids?.some(nextBid => nextBid.id === placedBid.id);
            if(!isRemoved) return;
            if(this._pendingRequests.delete(placedBid.event.id)) {
                this._registerChangedEvent(placedBid.event);
                this._logger.__logFlowReaction(this.pathFromRootFlow, 'pending request cancelled', {eventId: placedBid.event.id});
            }
            if (placedBid.type === 'askFor' || placedBid.type === 'validate' || placedBid.type === 'block') {
                this._registerChangedEvent(placedBid.event);
            }
        });
        this._placedBids = nextPlacedBids;
    }

    /**
     * handle the next iterator result
     * @param next the iterator result of the generator
     */
    private _handleNext(next: FlowIteratorResult): void {
        if(this._hasEnded) return;
        if(next.done) {
            this.__end(true);
        } else {
            const nextBids = toBids(next.value);
            this._placeBids(nextBids);
        }
    }

    /**
     * return flow to the initial state
     */
    private _resetToInitial(keepExtends?: boolean): void {
        this._onCleanupCallback?.();
        delete this._onCleanupCallback;
        this._placeBids(undefined);
        this._currentBidId = 0;
        this._hasEnded = false;
        this._isDisabled = false;
        delete this._latestActionIdThisFlowProgressedOn;
        if(!keepExtends) {
            this._pendingExtends.clear();
        }
        this._children.forEach((child) => {
            child.__end();
        });
        this._children.clear();
    }


    // INTERNAL ------------------------------------------------------------------------------------------

    /**
     * @internal
     * end the flow execution
     * @param keepExtends when a flow ends by progressing the last bid, the extends of this flow should be kept.
     */
    public __end(keepExtends?: boolean): void {
        this._resetToInitial(keepExtends);
        this._hasEnded = true;
        this._logger.__logFlowReaction(this.pathFromRootFlow, 'flow ended', {});
    }

    /**
     * @internal
     * when the flow is enabled, the flows enabledOnActionId property will be set to the currently executed action id
     */
    public __enabledOnActionId?: number;

    /**
     * @internal
     * disable the flow and all its children
     * @remarks will cancel all pending requests, all pending extends will be kept
     * @remarks disabled flows will not place any bids
     */
    public __disable(): void {
        this._isDisabled = true;
        this._pendingRequests.forEach(request => {
            this._registerChangedEvent(request.event);
            this._logger.__logFlowReaction(this.pathFromRootFlow, 'pending request cancelled', {eventId: request.event.id});
            this._pendingRequests.delete(request.event.id);
        });
        this._logger.__logFlowReaction(this.pathFromRootFlow, 'flow disabled', {});
        this._children.forEach((child) => {
            child.__disable();
        });
    }

    /**
     * @internal
     * restarts the flow
     * @param nextParameters the parameters that will be checked against the current parameters. If changed, the flow will be restarted with the new parameters.
     */
    public __restart(nextParameters?: any[]): void {
        if(nextParameters !== undefined) {
            this._currentParameters = [...nextParameters];
        }
        this._resetToInitial();
        this._generator = this._generatorFunction(...(this._currentParameters || []));
        try {
            this._handleNext.bind(this)(this._generator.next());
        } catch(error) {
            console.error('error in flow ', this.id, ': ', error);
            this.__end(true);
            return;
        }
    }

    /**
     * get the current bids and pending bids of this flow
     * @internal
     * @returns all bids and pending information (see FlowBidsAndPendingInformation)
     */
    public __getBidsAndPendingInformation(): AllBidsAndPendingInformation {
        const placedBids = this.isDisabled ? [] : this._placedBids || [];
        const result = {
            placedBids,
            pendingRequests: this._pendingRequests,
            pendingExtends: this._pendingExtends,
        };
        this._children.forEach((child) => {
            const childBidsAndPendingInformation = child.__getBidsAndPendingInformation();
            result.placedBids = [...childBidsAndPendingInformation.placedBids, ...result.placedBids];
            result.pendingRequests = mergeMaps(result.pendingRequests, childBidsAndPendingInformation.pendingRequests);
            result.pendingExtends = mergeMaps(result.pendingExtends, childBidsAndPendingInformation.pendingExtends);
        });
        return result
    }

    /**
     * react to an error. continue/restart the flow based on an error that occurred.
     * if the error is not handled by the flow, it will act as an error boundary and restart the flow.
     * @internal
     * @internalRemarks mutates: ._generator (next)
     */
    public __onRejectAsyncAction(event: Event<any, any>): void {
        this._pendingRequests.delete(event.id);
        this._registerChangedEvent(event);
        let next: FlowIteratorResult;
        try {
            next = this._generator.throw(new Error('async request rejected'));
        }
        catch(error) {
            console.error('error in flow ', this.id, ': ', error);
            this._logger.__logFlowReaction(this.pathFromRootFlow, 'flow restarted because an error was not handled', {eventId: event.id});
            this.__restart();
            return;
        }
        this._logger.__logFlowReaction(this.pathFromRootFlow, 'flow progressed on a handled error', {eventId: event.id});
        this._handleNext(next);
    }

    /**
     * react to an event. Continue the flow based on an occurred event
     * @internal
     * @param event the event that occurred
     * @param bidId the id of the bid that was placed and corresponds to the event
     * @param actionId the id of the action to check if the flow already progressed on this action
     * @internalRemarks mutates: ._generator (next)
     */
    public __onEvent(event: Event<any, any>, bid: Placed<AnyBid<any, any>>, actionId: number): void {
        if(this._latestActionIdThisFlowProgressedOn === actionId) return; // prevent from progressing twice on the same action
        this._registerChangedEvent(event);
        this._latestActionIdThisFlowProgressedOn = actionId;
        try {
            const next = this._generator.next([event, filterRemainingBids(bid.id, this._placedBids)]);
            this._logger.__logFlowReaction(this.pathFromRootFlow, 'flow progressed on a bid', {bidId: bid.id, bidType: bid.type, eventId: event.id, actionId: actionId});
            if(isProgressingBid(bid) && bid.isGetValueBid) {
                // disable all children that are not enabled during the last progress
                this._children.forEach((child) => {
                    if(child.__enabledOnActionId !== actionId) {
                        child.__disable();
                    }
                });
            }
            this._handleNext(next);
        } catch(error) {
            console.error('error in flow ', this.id, ': ', error, 'flow ended');
            throw(error);
            this.__end(true);
        }
    }

    /**
     * react to an extend action. Continue the flow based on an occurred extend action
     * @internal
     * @param event the event that occurred
     * @param bidId the id of the bid that was placed and corresponds to the event
     * @param extend the pending extend information
     * @param actionId the id of the action to check if the flow already progressed on this action
     */
    public __onExtend<P, V>(event: Event<P, V>, bid: Placed<AnyBid<any, any>>, extend: PendingExtend<P,V>, actionId: number): void {
        this._pendingExtends.set(event.id, extend);
        this._logger.__logFlowReaction(this.pathFromRootFlow, 'pending extend added', {eventId: event.id, bidId: bid.id, bidType: bid.type, actionId: actionId});
        if(isThenable(extend.value)) return;
        this.__onEvent(event, bid, actionId);
    }

    /**
     * react to an async event. Add a pending request.
     * if the promise is resolved or rejected, a corresponding action will be added to the queue.
     * @internal
     * @param action the action that holds the promise payload
     */
    public __onRequestedAsync<P, V>(bid: Placed<RequestBid<P,V>>, promise: Promise<P>, requestActionId: number): void {
        this._pendingRequests.set(bid.event.id, bid);
        this._logger.__logFlowReaction(this.pathFromRootFlow, 'pending request added', {eventId: bid.event.id, bidId: bid.id, bidType: bid.type, actionId: requestActionId});
        this._registerChangedEvent(bid.event);
        promise.then((value: P) => {
            if(this._pendingRequests.get(bid.event.id) != bid) {
                return; // the request was cancelled
            }
            const resolveAction: ResolvePendingRequestAction<P> = {
                id: null,
                eventId: bid.event.id,
                type: 'resolvePendingRequest',
                flowId: this.id,
                bidId: bid.id,
                payload: value,
                requestActionId
            };
            this._executeAction(resolveAction);
        }).catch((error: unknown) => {
            console.error('error in flow ', this.id, ': ', error);
            if(this._pendingRequests.get(bid.event.id) != bid) {
                return; // the request was cancelled
            }
            const rejectAction: RejectPendingRequestAction = {
                id: null,
                eventId: bid.event.id,
                type: 'rejectPendingRequest',
                flowId: this.id,
                bidId: bid.id,
                requestActionId,
                error
            };
            this._executeAction(rejectAction);
        });
    }

    /**
     * remove a pending request
     * this function will not progress the flow, because the resolved pending event could be extended again by another flow
     * @internal
     * @param event the event that was extended by this flow
     */
     public __resolvePendingRequest(event: Event<any,any>): void {
        const wasRemoved = this._pendingRequests.delete(event.id);
        if(wasRemoved) {
            this._logger.__logFlowReaction(this.pathFromRootFlow, 'pending request resolved', {eventId: event.id});
            this._registerChangedEvent(event);
        }
    }

    // PUBLIC --------------------------------------------------------------------------------------------

    /**
     * get the id of this flow
     */
    public get id(): string {
        return this.pathFromRootFlow[this.pathFromRootFlow.length - 1];
    }

    /**
     * start a flow as a child flow of the current parent flow (this)
     * @param id the id of the child flow
     * @param generatorFunction the generator function of the child flow
     * @param parameters the parameters that will be passed as a flow context, if undefined, the flow will be ended
     * @returns the child flow or undefined if the flow was not started / ended
     * @internalRemarks mutates: ._children
     */
    public flow<T extends FlowGeneratorFunction>(id: string, generatorFunction: T, parameters: Parameters<T>): Flow | undefined {
        const currentChild = this._children.get(id);
        if(currentChild) {
            // child flow with this id already exists:
            if(currentChild._isDisabled) {
                this._isDisabled = false;
                this._logger.__logFlowReaction(this.pathFromRootFlow, 'flow enabled, after being disabled', {childFlowId: currentChild.id});
            }
            if(!areDepsEqual(currentChild.parameters || [], parameters)) {
                this._logger.__logFlowReaction([...this.pathFromRootFlow, currentChild.id], 'flow restarted because parameters changed', {childFlowId: currentChild.id});
                currentChild.__restart(parameters);
            }
            currentChild.__enabledOnActionId = this._latestActionIdThisFlowProgressedOn;
            return currentChild;
        }
        // no child flow with this id exists:
        const newChild = new Flow({
            pathFromRootFlow: [...this.pathFromRootFlow, id],
            generatorFunction,
            executeAction: this._executeAction,
            logger: this._logger,
            registerChangedEvent: this._registerChangedEvent,
            parameters,
        });
        this._children.set(id, newChild);
        newChild.__enabledOnActionId = this._latestActionIdThisFlowProgressedOn;
        return newChild;
    }

    /**
     * keep the flow alive, after a useValue or useValues bid was placed, and the flow is not enabled by the flow() function
     */
    public keepEnabled(idOrFlow: string | Flow): void {
        const id = typeof idOrFlow === 'string' ? idOrFlow : idOrFlow.id;
        const currentChild = this._children.get(id);
        if(!currentChild) return;
        if(currentChild.isDisabled) return;
        currentChild.__enabledOnActionId = this._latestActionIdThisFlowProgressedOn;
    }

    /**
     * end all child flows with the given id
     * @param ids the ids of the child flows to end. if not given, all child flows will be ended
     */
    public endFlows(ids?: string[]): void {
        if(!ids) {
            this._children.forEach((child) => {
                child.__end();
            });
            this._children.clear();
            return;
        }
        ids.forEach((id) => {
            const child = this._children.get(id);
            if(child) {
                child.__end();
                this._children.delete(id);
            }
        });
    }

    /**
     * end a child flow with the given id
     * @param id the id of the child flow to end
     */
    public endFlow(id: string): void {
        this.endFlows([id]);
    }

    /**
     * restarts the flow
     * @param restartIf if true, the flow will be restarted. if a function is given, the function will be called and the flow will be restarted if the function returns true
     */
    public restart(restartIf?: boolean | (() => boolean)): void {
        if(typeof restartIf === 'boolean' && !restartIf) {
            return;
        }
        if(typeof restartIf === 'function' && !restartIf()) {
            return;
        }
        this._logger.__logFlowReaction(this.pathFromRootFlow, 'flow restarted manually by calling flow.restart', {});
        this.__restart();
    }

    /**
     * abort a pending extend. Like the extend never happened.
     * this will set the event back to a none-pending state, and the event.extendedValue will be set to undefined
     * @param event the event that was extended by this flow
     */
    public abortExtend(event: Event<any,any>): boolean {
        const wasRemoved = this._pendingExtends.delete(event.id);
        if(wasRemoved) {
            this._logger.__logFlowReaction(this.pathFromRootFlow, 'pending extend aborted', {eventId: event.id});
            this._registerChangedEvent(event);
        }
        return wasRemoved;
    }

    /**
     * @internal
     * resolve the pending extend
     * this will set the event back to a none-pending state, and the event.extendedValue will be set to undefined
     * @param event the event that was extended by this flow
     */
    public __resolveExtend(event: Event<any,any>): boolean {
        const wasRemoved = this._pendingExtends.delete(event.id);
        if(wasRemoved) {
            this._logger.__logFlowReaction(this.pathFromRootFlow, 'pending extend resolved', {eventId: event.id});
            this._registerChangedEvent(event);
        }
        return wasRemoved;
    }


    /**
     * register a callback that will be called when the flow is ended / restarted.
     * use this to clean up any resources that are used by the flow.
     * @param callback the callback that will be called when the flow is is ended / restarted
     */
    public cleanup(callback: () => void): void {
        this._onCleanupCallback = callback;
    }


    // GETTER --------------------------------------------------------------------------------------------

    /**
     * getter that returns true if the flow has ended
     * a flow that has ended will not place any bids, or hold any pending requests or extends
     * @returns true if the flow has ended
     */
    public get hasEnded(): boolean {
        return this._hasEnded;
    }

    /**
     * getter that returns all pending extends by this flow
     * @returns a map of all pending requests information by this flow (see PendingRequest)
     */
    public get pendingExtends(): Map<string, PendingExtend<any, any>> {
        return this._pendingExtends;
    }

    /**
     * getter that returns all pending extends by this flow
     * @returns a map of all pending requests information by this flow (see PendingRequest)
     */
    public get pendingRequests(): Map<string, Placed<RequestBid<any, any>>> {
        return this._pendingRequests;
    }

    /**
     * getter that returns the current parameters of the flow
     * @returns the current parameters of the flow
     */
    public get parameters(): any[] | undefined {
        return this._currentParameters;
    }

    /**
     * get the latest action id where this flow has progressed
     * @returns the latest action id where this flow has progressed
     */
    public get latestActionId(): number | undefined {
        return this._latestActionIdThisFlowProgressedOn;
    }

    /**
     * getter that returns true if the flow is disabled
     * a disabled flow will not place any bids, but will hold
     */
    public get isDisabled(): boolean {
        return this._isDisabled;
    }
}