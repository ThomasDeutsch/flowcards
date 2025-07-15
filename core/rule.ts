import { InputAction, RejectPendingRequestAction, ResolvePendingRequestAction } from "./action.ts";
import { toBids, filterRemainingBids, Placed, SetBid, AnyBid, GivenBid } from "./bid.ts";
import { Event } from  "./event.ts";
import { ActionReactionLogger } from "./action-reaction-logger.ts";
import { mergeMaps } from "./utils.ts";
import { isValidReturn } from "./payload-validation.ts";


// INTERFACES -------------------------------------------------------------------------------------------------------------

export type TNext = AnyBid<any, any> | Placed<AnyBid<any, any>> | (AnyBid<any, any> | Placed<AnyBid<any, any>>)[] | undefined;
export type RuleProgressInfo = [Event<unknown, unknown>, Placed<AnyBid<unknown, unknown>>[] | undefined];
export type RuleGenerator = Generator<TNext, void, RuleProgressInfo>;
export type RuleGeneratorFunction = (this: Rule) => RuleGenerator;
type RuleIteratorResult = IteratorResult<TNext | undefined, void>;

export interface RuleParameters {
    pathFromRootRule: string[];
    generatorFunction: RuleGeneratorFunction;
    runEngine: (action?: InputAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction) => void;
    registerChangedEvent: (event: Event<any, any>) => void;
    logger: ActionReactionLogger;
    extendInformation?: ExtendInformation<any, any>;
}

export interface AllBidsAndPendingInformation {
    placedBids: Placed<AnyBid<any, any>>[];
    activeGivenBids?: Placed<GivenBid<any, any>>[];
    pendingRequests: Map<string, Placed<SetBid<any, any>>>;
    pendingExtends: ExtendInformation<any, any>[];
}

export interface ExtendInformation<P, V> {
    value?: P | Promise<P>;
    event: Event<P,V>;
    extendedBids: Placed<AnyBid<P, V>>[];
    extendingRule?: Rule;
}


// CORE FUNCTIONS -----------------------------------------------------------------------------------------------

export class Rule {
    private readonly _generatorFunction: RuleGeneratorFunction;
    private _generator: RuleGenerator;
    private _children: Map<string, Rule> = new Map();
    private _hasEnded = false;
    private _currentBidId = 0;
    private _isDisabled = false;
    private _activeGivenBids: Placed<GivenBid<any, any>>[] = [];
    private _placedBids: Placed<AnyBid<unknown, unknown>>[] | undefined;
    private _pendingRequests: Map<string, Placed<SetBid<any, any>>> = new Map();
    private _extendInformation?: ExtendInformation<any, any>
    private _runEngine: (action?: InputAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction) => void;
    private _registerChangedEvent: (event: Event<any, any>) => void;
    private _latestActionIdThisRuleProgressedOn?: number;
    private _latestBidThisRuleProgressedOn?: Placed<AnyBid<any, any>>;
    private _logger: ActionReactionLogger;
    private _onCleanupCallback?: () => void;
    public description = "";
    public readonly pathFromRootRule: string[];

    constructor(parameters: RuleParameters) {
        this.pathFromRootRule = parameters.pathFromRootRule;
        this._generatorFunction = parameters.generatorFunction.bind(this);
        this._runEngine = parameters.runEngine;
        this._logger = parameters.logger;
        this._registerChangedEvent = parameters.registerChangedEvent;
        this._extendInformation = parameters.extendInformation;
        this._resetToInitial();
        this._generator = this._generatorFunction();
        this._logger.__logRuleReaction(this.pathFromRootRule, 'rule enabled', {});
        try {
            this._handleNext.bind(this)(this._generator.next());
        } catch(error) {
            console.error('first .next call in constructor exited with an error: ', this.id, ': ', error, '.rule will be ended');
            this.__end();
        }
    }

    // PRIVATE -------------------------------------------------------------------------------------------

    private _cancelAllPendingRequests(): void {
        this._pendingRequests.forEach(request => {
            this._registerChangedEvent(request.event);
            this._logger.__logRuleReaction(this.pathFromRootRule, 'pending request cancelled', {eventId: request.event.id, actionId: request.requestActionId});
            this._pendingRequests.delete(request.event.id);
        });
    }

    private _placeBids(nextBids?: (AnyBid<any, any> | Placed<AnyBid<any, any>>)[]): void {
        const nextPlacedBids = nextBids?.map(bid => {
            if('id' in bid) {
                return {...bid, rule: this, id: bid.id} as Placed<AnyBid<any, any>>;
            }
            else {
                const newBidId = this._currentBidId++;
                if(bid.type === 'when') {
                    this._registerChangedEvent(bid.event);
                }
                this._logger.__logRuleReaction(this.pathFromRootRule, 'bid placed', {eventId: bid.event.id, bidType: bid.type, bidId: newBidId });
                return {...bid, rule: this, id: newBidId} as Placed<AnyBid<any, any>>;
            }
        });
        // get all bids that are no longer placed
        this._placedBids?.forEach((placedBid) => {
            const isRemoved = !nextPlacedBids?.some(nextBid => nextBid.id === placedBid.id);
            if(!isRemoved) return;
            const pendingRequest = this._pendingRequests.get(placedBid.event.id);
            if(pendingRequest) {
                this._pendingRequests.delete(placedBid.event.id);
                this._registerChangedEvent(placedBid.event);
                this._logger.__logRuleReaction(this.pathFromRootRule, 'pending request cancelled', {eventId: placedBid.event.id, actionId: placedBid.requestActionId});
            }
            if (placedBid.type === 'when') {
                this._registerChangedEvent(placedBid.event);
            }
        });
        this._placedBids = nextPlacedBids;
    }

    private _handleNext(next: RuleIteratorResult): void {
        if(this._hasEnded) return;
        if(next.done) {
            this.__end();
        } else {
            const nextBids = toBids(next.value);
            this._placeBids(nextBids);
            // if one of the next bids is a given bid, then progress on the given bid if the event is active (a value was set) and the validation function returns true
            const potentialGivenBid = this._placedBids?.find(bid => bid.type === 'given');
            if(potentialGivenBid?.event.hasValue) {
                const isValid = isValidReturn(potentialGivenBid.validate?.(potentialGivenBid.event.value));
                if(isValid) {
                    const givenBid = potentialGivenBid as Placed<GivenBid<any, any>>;
                    try {
                        const nextResult = this._generator.next([givenBid.event, filterRemainingBids(givenBid.id, this._placedBids)]);
                        this._logger.__logRuleReaction(this.pathFromRootRule, 'rule progressed on a bid', {bidId: givenBid.id, bidType: givenBid.type, eventId: givenBid.event.id});
                        this.__addActiveGivenBid(givenBid);
                        this._handleNext(nextResult);
                    } catch(error) {
                        console.error('error in rule ', this.id, ': ', error, 'rule ended');
                        this.__end();
                        throw error;
                    }
                } else {
                    this._logger.__logRuleReaction(this.pathFromRootRule, 'bid validation failed', {eventId: potentialGivenBid.event.id, bidType: potentialGivenBid.type, bidId: potentialGivenBid.id, value: potentialGivenBid.event.value });
                }
            }
        }
    }

    private _resetToInitial(): void {
        this._activeGivenBids = [];
        this._onCleanupCallback?.();
        delete this._onCleanupCallback;
        this._placeBids(undefined);
        this._currentBidId = 0;
        this._hasEnded = false;
        this._isDisabled = false;
        delete this._latestActionIdThisRuleProgressedOn;
        delete this._latestBidThisRuleProgressedOn;
        this._cancelAllPendingRequests();
        this._children.forEach((child) => {
            child.__end();
        });
        this._children.clear();
    }


    // INTERNAL ------------------------------------------------------------------------------------------

    public __end(): void {
        if(this._hasEnded) return;
        this.endChildRules();
        this._hasEnded = true;
        this._placeBids(undefined);
        this._logger.__logRuleReaction(this.pathFromRootRule, 'rule ended', {});
    }

    public __enabledOnActionId?: number;

    public __disable(): void {
        this._isDisabled = true;
        this._cancelAllPendingRequests();
        this._logger.__logRuleReaction(this.pathFromRootRule, 'rule disabled', {});
    }

    public __restart(reasonWasChangedGiven?: boolean): void {
        this._resetToInitial();
        this._generator = this._generatorFunction();
        if(reasonWasChangedGiven) {
            this._logger.__logRuleReaction(this.pathFromRootRule, 'rule restarted because the value of a given event changed', {});
        }
        try {
            this._handleNext.bind(this)(this._generator.next());
        } catch(error) {
            console.error('error in rule ', this.id, ': ', error);
            this.__end();
            return;
        }
    }

    public __addActiveGivenBid(bid: Placed<GivenBid<any, any>>): void {
        this._logger.__logRuleReaction(this.pathFromRootRule, 'an active given was added', {eventId: bid.event.id});
        this._activeGivenBids.push({...bid, isActive: true});
    }

    public __getBidsAndPendingInformation(): AllBidsAndPendingInformation {
        if(this._isDisabled || this._hasEnded) return {placedBids: [], pendingExtends: [], pendingRequests: new Map()};
        const placedBids = this._placedBids || [];
        if(this._activeGivenBids.length > 0) {
            placedBids.push(...this._activeGivenBids);
        }
        const result: AllBidsAndPendingInformation = {
            placedBids,
            pendingRequests: this._pendingRequests,
            pendingExtends: this._extendInformation ? [this._extendInformation] : []
        };
        this._children.forEach((child) => {
            const childBidsAndPendingInformation = child.__getBidsAndPendingInformation();
            result.placedBids = [...childBidsAndPendingInformation.placedBids, ...result.placedBids];
            result.pendingRequests = mergeMaps(result.pendingRequests, childBidsAndPendingInformation.pendingRequests);
            result.pendingExtends.push(...childBidsAndPendingInformation.pendingExtends);
        });
        return result
    }

    public __onRejectAsyncAction(event: Event<any, any>): void {
        this._pendingRequests.delete(event.id);
        this._registerChangedEvent(event);
        let next: RuleIteratorResult;
        try {
            next = this._generator.throw(new Error(`async request rejected`));
        }
        catch(error) {
            console.error('error in rule ', this.id, ': ', error);
            if(this._latestBidThisRuleProgressedOn === undefined) {
                this._logger.__logRuleReaction(this.pathFromRootRule, 'rule ended because an error on the first bid was not handled', {eventId: event.id});
                this.__end();
                return;
            }
            this._logger.__logRuleReaction(this.pathFromRootRule, 'rule restarted because an error was not handled', {eventId: event.id});
            this.__restart();
            return;
        }
        this._logger.__logRuleReaction(this.pathFromRootRule, 'rule progressed on a handled error', {eventId: event.id});
        this._handleNext(next);
    }

    public __onEvent(event: Event<any, any>, bid: Placed<AnyBid<any, any>>, actionId: number): void {
        if(this._latestActionIdThisRuleProgressedOn === actionId) return; // prevent from progressing twice on the same action
        this._registerChangedEvent(event);
        this._latestActionIdThisRuleProgressedOn = actionId;
        this._latestBidThisRuleProgressedOn = bid;
        try {
            const next = this._generator.next([event, filterRemainingBids(bid.id, this._placedBids)]);
            this._logger.__logRuleReaction(this.pathFromRootRule, 'rule progressed on a bid', {bidId: bid.id, bidType: bid.type, eventId: event.id, actionId: actionId});
            this._handleNext(next);
        } catch(error) {
            console.error('error in rule ', this.id, ': ', error, 'rule ended');
            this.__end();
            throw error;
        }
    }

    public __onRequestedAsync<P, V>(bid: Placed<SetBid<P,V>>, promise: Promise<P>, requestActionId: number): void {
        this._pendingRequests.set(bid.event.id, {...bid, requestActionId: requestActionId});
        this._logger.__logRuleReaction(this.pathFromRootRule, 'pending request added', {eventId: bid.event.id, bidId: bid.id, bidType: bid.type, actionId: requestActionId});
        this._registerChangedEvent(bid.event);
        promise.then((value: P) => {
            if(this._pendingRequests.get(bid.event.id)?.requestActionId !== requestActionId) {
                return;
            }
            const resolveAction: ResolvePendingRequestAction<P> = {
                id: null,
                eventId: bid.event.id,
                type: 'resolvePendingRequest',
                rulePath: this.path,
                bidId: bid.id,
                payload: value,
                requestActionId
            };
            this._runEngine(resolveAction);
        }).catch((error: unknown) => {
            console.error('error in rule ', this.id, ': ', error);
            if(this._pendingRequests.get(bid.event.id)?.requestActionId !== requestActionId) {
                return;
            }
            const rejectAction: RejectPendingRequestAction = {
                id: null,
                eventId: bid.event.id,
                type: 'rejectPendingRequest',
                rulePath: this.path,
                bidId: bid.id,
                requestActionId,
                error
            };
            this._runEngine(rejectAction);
        });
    }

    public __resolvePendingRequest(event: Event<any,any>): void {
        const pendingRequest = this._pendingRequests.get(event.id);
        if(pendingRequest) {
            this._pendingRequests.delete(event.id);
            this._logger.__logRuleReaction(this.pathFromRootRule, 'pending request resolved', {eventId: event.id, actionId: pendingRequest.requestActionId });
            this._registerChangedEvent(event);
        }
    }

    public __resolveExtend(event: Event<any,any>): boolean {
        if(this._extendInformation?.event.id !== event.id) return false;
        this._extendInformation = undefined;
        this._logger.__logRuleReaction(this.pathFromRootRule, 'pending extend resolved', {eventId: event.id});
        this._registerChangedEvent(event);
        return true;
    }

    // PUBLIC --------------------------------------------------------------------------------------------

    public get id(): string {
        return this.pathFromRootRule[this.pathFromRootRule.length - 1];
    }

    public rule<T extends RuleGeneratorFunction>(id: string, generatorFunction: T, runEngine?: boolean, extendInformation?: ExtendInformation<any, any>): Rule | undefined {
        const currentChild = this._children.get(id);
        if(currentChild) {
            if(currentChild._isDisabled) {
                currentChild._isDisabled = false;
                this._logger.__logRuleReaction(this.pathFromRootRule, 'rule enabled, after being disabled', {childRuleId: currentChild.id});
            }
            currentChild.__enabledOnActionId = this._latestActionIdThisRuleProgressedOn;
            return currentChild;
        }
        const newChild = new Rule({
            pathFromRootRule: [...this.pathFromRootRule, id],
            generatorFunction,
            logger: this._logger,
            extendInformation: extendInformation ? {...extendInformation} : undefined,
            registerChangedEvent: this._registerChangedEvent,
            runEngine: this._runEngine
        });
        this._children.set(id, newChild);
        newChild.__enabledOnActionId = this._latestActionIdThisRuleProgressedOn;
        if(runEngine) {
            this._runEngine();
        }
        return newChild;
    }

    private endChildRule(id: string): void {
        const child = this._children.get(id);
        if(child && !child.hasEnded) {
            child.__end();
            this._children.delete(id);
        }
    }

    public endChildRules(ids?: string[]): void {
        if(!ids) {
            this._children.forEach((child, id) => this.endChildRule(id));
            this._children.clear();
            return;
        }
        ids.forEach(id => this.endChildRule(id));
    }

    public restart(restartIf?: boolean | (() => boolean)): void {
        if(typeof restartIf === 'boolean' && !restartIf) {
            return;
        }
        if(typeof restartIf === 'function' && !restartIf()) {
            return;
        }
        this._logger.__logRuleReaction(this.pathFromRootRule, 'rule restarted manually by calling rule.restart', {});
        this.__restart();
    }

    public abortExtend(event: Event<any,any>): boolean {
        if(this._extendInformation?.event.id !== event.id) return false;
        this._extendInformation = undefined;
        this._logger.__logRuleReaction(this.pathFromRootRule, 'pending extend aborted', {eventId: event.id});
        this._registerChangedEvent(event);
        return true;
    }

    public cleanup(callback: () => void): void {
        this._onCleanupCallback = callback;
    }


    // GETTER --------------------------------------------------------------------------------------------

    public get hasEnded(): boolean {
        return this._hasEnded;
    }

    public get pendingRequests(): Map<string, Placed<SetBid<any, any>>> {
        return this._pendingRequests;
    }

    public get latestActionId(): number | undefined {
        return this._latestActionIdThisRuleProgressedOn;
    }

    public get isDisabled(): boolean {
        return this._isDisabled;
    }

    public get children(): Rule[] {
        return [...this._children.values()];
    }

    public get path(): string[] {
        return [...this.pathFromRootRule];
    }

    public get latestEvent(): Event<any, any> | undefined {
        return this._latestBidThisRuleProgressedOn?.event;
    }

    public get latestBid(): Placed<AnyBid<any, any>> | undefined {
        return this._latestBidThisRuleProgressedOn;
    }
}