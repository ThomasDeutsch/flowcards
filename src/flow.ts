import { ExternalAction, RejectPendingRequestAction, ResolvePendingRequestAction } from "./action";
import { Bid, toBids, PlacedBid, filterRemainingBids, PlacedRequestBid } from "./bid";
import { Event } from  "./event";
import { ActionReactionLogger } from "./action-reaction-logger";
import { areDepsEqual, isThenable, mergeMaps } from "./utils";

export interface FlowInfo<T extends FlowGeneratorFunction> {
    id: string;
    flowGeneratorFunction: T;
}

/**
 * create a flow info object. after this, the flow can be started with the start method.
 * @param id id of the flow
 * @param flowGeneratorFunction the generator function of the flow
 * @returns a flow info object
 */
export function flow<T extends FlowGeneratorFunction>(id: string, flowGeneratorFunction: T): FlowInfo<T> {
    return {id, flowGeneratorFunction};
}

/**
 * type used for the iterator result of a flow generator
 * a flow generators next value can return a bid or an array of bids.
 * if a flow places the same bid again, it is a PlacedBid.
 */
export type TNext = Bid<any, any> | PlacedBid<any, any> | (Bid<any, any> | PlacedBid<any, any>)[] | undefined;

/**
 * The progress info contains information about the latest progression of this flow.
 * The information contains the latest progressed event and the remaining bids for this flow.
*/
export type FlowProgressInfo = [Event<unknown>, PlacedBid<unknown, unknown>[] | undefined];

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
    id: string;
    generatorFunction: FlowGeneratorFunction;
    executeAction: (action: ExternalAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction) => void;
    logger: ActionReactionLogger;
    parameters?: any[];
}

/**
 * information about the flow bids and pending events
 */
export interface FlowBidsAndPendingInformation {
    placedBids: PlacedBid<unknown, unknown>[];
    pendingRequests?: Map<string, PlacedRequestBid<any, any>>;
    pendingExtends?: Map<string, PendingExtend<any, any>>;
}

/**
 * all needed information about a pending extend
 */
 export interface PendingExtend<P, V> {
    value?: P;
    event: Event<P,V>;
    extendingFlow: Flow;
    extendedBid: PlacedBid<P, V>;
}

/**
 * a flow is a wrapper for a generator function.
 * a flow is able to place bids and react to actions.
 */
export class Flow {
    public readonly id: string;
    private readonly _generatorFunction: FlowGeneratorFunction;
    private _generator: FlowGenerator;
    private _children: Map<string, Flow> = new Map();
    private _hasEnded: boolean;
    private _currentBidId: number;
    private _placedBids: PlacedBid<unknown, unknown>[] | undefined;
    private _pendingRequests: Map<string, PlacedRequestBid<any, any>> = new Map();
    private _pendingExtends: Map<string, PendingExtend<any, any>> = new Map();
    private _executeAction: (action: ExternalAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction) => void;
    private _latestActionIdThisFlowProgressedOn?: number;
    private _latestEventThisFlowProgressedOn?: Event<any, any>;
    private _logger: ActionReactionLogger;
    private _currentParameters?: any[];

    constructor(parameters: FlowParameters) {
        // this initialization is only done once
        this.id = parameters.id;
        this._generatorFunction = parameters.generatorFunction.bind(this);
        this._executeAction = parameters.executeAction;
        this._logger = parameters.logger;
        // this initialization is also done in the restart method
        this._currentBidId = 0;
        this._hasEnded = false;
        this._currentParameters = parameters.parameters;
        this._generator = this._generatorFunction(...(parameters.parameters || []));
        try {
            this._handleNext.bind(this)(this._generator.next());
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
    private _placeBids(nextBids?: (Bid<any, any> | PlacedBid<any, any>)[]): void {
        const nextPlacedBids = nextBids?.map(bid => {
            if('id' in bid) {
                return {...bid, flow: this, id: bid.id} as PlacedBid<any, any>;
            }
            else {
                if(bid.type === 'askFor' || bid.type === 'validate' || bid.type === 'block') {
                    this._logger.logChangedEvent(bid.event);
                }
                return {...bid, flow: this, id: this._currentBidId++} as PlacedBid<any, any>;
            }
        });
        // get all bids that are no longer placed
        this._placedBids?.forEach((placedBid) => {
            const isRemoved = !nextPlacedBids?.some(nextBid => nextBid.id === placedBid.id);
            if(!isRemoved) return;
            if(this._pendingRequests.delete(placedBid.event.id)) {
                this._logger.logChangedEvent(placedBid.event);
                this._logger.logFlowReaction(this.id, 'pending request cancelled');
            }
            if (placedBid.type === 'askFor' || placedBid.type === 'validate' || placedBid.type === 'block') {
                this._logger.logChangedEvent(placedBid.event);
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
            this.__end();
        } else {
            const nextBids = toBids(next.value);
            this._placeBids(nextBids);
        }
    }

    /**
     * @internal
     * restarts the flow
     * @param nextParameters the parameters that will be checked against the current parameters. If changed, the flow will be restarted with the new parameters.
     */
    public __restart(nextParameters?: any[]): void {
        this._placeBids(undefined);
        this._hasEnded = false;
        this._currentBidId = 0;
        this._children.forEach((child) => {
            child.__end(true);
        });
        this._latestActionIdThisFlowProgressedOn = undefined;
        this._latestEventThisFlowProgressedOn = undefined;
        this._pendingExtends.clear();
        if(nextParameters !== undefined) {
            this._currentParameters = [...nextParameters];
        }
        this._generator = this._generatorFunction(...(this._currentParameters || []));
        try {
            this._handleNext.bind(this)(this._generator.next());
        } catch(error) {
            console.error('error in flow ', this.id, ': ', error, 'flow ended');
            this.__end();
        }
    }


    // INTERNAL ------------------------------------------------------------------------------------------

    /**
     * get the current bids and pending bids of this flow
     * @internal
     * @returns all bids and pending information (see FlowBidsAndPendingInformation)
     */
    public __getBidsAndPendingInformation(): FlowBidsAndPendingInformation {
        const result = {
            placedBids: this._placedBids || [],
            pendingRequests: this._pendingRequests,
            pendingExtends: this._pendingExtends,
        };
        this._children.forEach((child) => {
            const childBidsAndPendingInformation = child.__getBidsAndPendingInformation();
            result.placedBids = [...childBidsAndPendingInformation.placedBids, ...result.placedBids];
            result.pendingRequests = mergeMaps(result.pendingRequests, childBidsAndPendingInformation.pendingRequests);
            result.pendingExtends = mergeMaps(result.pendingExtends, childBidsAndPendingInformation.pendingExtends);
        });
        return result;
    }

    /**
     * react to an error. continue/restart the flow based on an error that occurred.
     * if the error is not handled by the flow, it will act as an error boundary and restart the flow.
     * @internal
     * @internalRemarks mutates: ._generator (next)
     */
    public __onRejectAsyncAction(event: Event<any, any>): void {
        const pendingRequestBidId = this._pendingRequests.get(event.id)?.id;
        this._pendingRequests.delete(event.id);
        this._logger.logChangedEvent(event);
        let next: FlowIteratorResult;
        try {
            next = this._generator.throw(new Error('async request rejected'));
        }
        catch(error) {
            console.error('error in flow ', this.id, ': ', error);
            if(pendingRequestBidId === 0) {
                this._logger.logFlowReaction(this.id, 'error hot handled -> flow ended to prevent infinite loop because request was placed at the beginning of the flow');
                this.__end();
                return;
            }
            this._logger.logFlowReaction(this.id, 'error hot handled -> flow restarted');
            this.__restart();
            return;
        }
        this._logger.logFlowReaction(this.id, 'error handled -> flow progressed');
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
    public __onEvent(event: Event<any, any>, bidId: number, actionId: number): void {
        if(this._latestActionIdThisFlowProgressedOn === actionId) return; // prevent from progressing twice on the same action
        this._logger.logChangedEvent(event);
        this._latestActionIdThisFlowProgressedOn = actionId;
        this._latestEventThisFlowProgressedOn = event;
        try {
            const next = this._generator.next([event, filterRemainingBids(bidId, this._placedBids)]);
            this._logger.logFlowReaction(this.id, 'flow progressed');
            this._handleNext(next);
        } catch(error) {
            console.error('error in flow ', this.id, ': ', error, 'flow ended');
            this.__end();
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
    public __onExtend<P, V>(event: Event<P, V>, bidId: number, extend: PendingExtend<P,V>, actionId: number): void {
        this._pendingExtends.set(event.id, extend);
        this._logger.logFlowReaction(this.id, 'pending extend added');
        if(isThenable(extend.value)) return;
        this.__onEvent(event, bidId, actionId);
    }

    /**
     * react to an async event. Add a pending request.
     * if the promise is resolved or rejected, a corresponding action will be added to the queue.
     * @internal
     * @param action the action that holds the promise payload
     */
    public __onRequestedAsync<P, V>(bid: PlacedRequestBid<P,V>, promise: Promise<P>, requestActionId: number): void {
        this._pendingRequests.set(bid.event.id, bid);
        this._logger.logFlowReaction(this.id, 'pending request added');
        this._logger.logChangedEvent(bid.event);
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
            this._logger.logFlowReaction(this.id, 'pending request resolved');
            this._logger.logChangedEvent(event);
        }
    }

    /**
     * @internal
     * end the flow execution
     * @param removeExtends if true, all pending extends will be removed ( used by replay )
     */
    public __end(removeExtends?: boolean): void {
        this._placeBids(undefined);
        this._hasEnded = true;
        this._currentBidId = 0;
        this._latestActionIdThisFlowProgressedOn = undefined;
        this._latestEventThisFlowProgressedOn = undefined;
        if(removeExtends) {
            this._pendingExtends.clear();
        }
        this._logger.logFlowReaction(this.id, 'flow ended');
        this._children.forEach((child) => {
            child.__end(removeExtends);
        });
        this._children.clear();
    }

    // PUBLIC --------------------------------------------------------------------------------------------

    /**
     * start a flow as a child flow of the current parent flow (this)
     * @param flowInfo id and generator function of the child flow
     * @param parameters the parameters that will be passed as a flow context, if undefined, the flow will be ended
     * @param key a key that can be used to instantiate multiple flows with the same id
     * @returns the child flow or undefined if the flow was not started / ended
     * @internalRemarks mutates: ._children
     */
    public start<T extends FlowGeneratorFunction>(flowInfo: FlowInfo<T>, parameters?: Parameters<T>, key?: string): Flow | undefined {
        const childFlowId = (key !== undefined) ? `${flowInfo.id}__key:${key}` : flowInfo.id;
        const currentChild = this._children.get(childFlowId);
        if(parameters === undefined) {
            this.endFlows([childFlowId]);
            return undefined;
        }
        if(currentChild) {
            if(!areDepsEqual(currentChild.parameters || [], parameters)) {
                this._logger.logFlowReaction(currentChild.id, 'parameters changed -> flow restarted');
                currentChild.__restart(parameters);
            }
            return currentChild;
        }
        const fullChildIdPath = `${(this.id)}>${childFlowId}`;
        const newChild = new Flow({
            id: fullChildIdPath,
            generatorFunction: flowInfo.flowGeneratorFunction,
            executeAction: this._executeAction,
            logger: this._logger,
            parameters,
        });
        this._children.set(childFlowId, newChild);
        return newChild;
    }

    public startFlow<T extends FlowGeneratorFunction>(id: string, generatorFunction: FlowGeneratorFunction, parameters?: Parameters<T>, key?: string): Flow | undefined {
        return this.start(flow(id, generatorFunction), parameters, key);
    }

    /**
     * end all child flows with the given id or flowInfo
     * @param idOrflowInfos the id or flowInfo of the child flows to end. if not given, all child flows will be ended
     */
    public endFlows(ids?: (string | FlowInfo<any>)[] | Record<string, FlowInfo<any>>): void {
        if(!ids) {
            this._children.forEach((child) => {
                child.__end();
            });
            this._children.clear();
            return;
        }
        if(!Array.isArray(ids)) {
            ids = Object.keys(ids)
        }
        ids.forEach((idOrFlowInfo) => {
            const id = (typeof idOrFlowInfo === 'string') ? idOrFlowInfo : idOrFlowInfo.id;
            const child = this._children.get(id);
            if(child) {
                child.__end();
                this._children.delete(id);
            }
        });
    }

    /**
     * end a child flow with the given id or flowInfo
     * @param idOrflowInfo the id or flowInfo of the child flow to end
     */
    public endFlow(idOrFlowInfo: string | FlowInfo<any>): void {
        this.endFlows([idOrFlowInfo]);
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
        this._logger.logFlowReaction(this.id, 'flow restarted manually by calling flow.restart');
        this.__restart();
    }

    /**
     * remove a pending extend
     * this function will not progress the flow, because the resolved extend could be extended again by another flow
     * @param event the event that was extended by this flow
     */
    public resolveExtend(event: Event<any,any>): boolean {
        const wasRemoved = this._pendingExtends.delete(event.id);
        if(wasRemoved) {
            this._logger.logFlowReaction(this.id, 'pending extend resolved');
            this._logger.logChangedEvent(event);
        }
        return wasRemoved;
    }


    // GETTER --------------------------------------------------------------------------------------------

    /**
     * getter that returns the first part of the flow id - its name
     * @returns the name of the flow
     */
    public get name(): string {
        return this.id[0];
    }

    /**
     * getter that returns the second part of the flow id - its key
     * @returns the key of the flow (or undefined if the flow has no key)
     */
    public get key(): string | null {
        return this.id[1];
    }

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
    public get pendingRequests(): Map<string, PlacedRequestBid<any, any>> {
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
     * get the latest event this flow has progressed on
     * @returns the event this flow has progressed on
     */
    public get latestEvent(): Event<any, any> | undefined {
        return this._latestEventThisFlowProgressedOn;
    }
}