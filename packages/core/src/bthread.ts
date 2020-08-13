import { Action, ActionType } from './action';
import {
    Bid, BidSubType, BidType, BThreadBids, getBidsForBThread, PendingEventInfo
} from './bid';
import { EventMap, FCEvent, toEvent } from './event';
import { EventCache, setEventCache } from './event-cache';
import { BThreadReactionType, Logger } from './logger';
import { ActionDispatch } from './update-loop';
import * as utils from './utils';

export type BTGen = Generator<Bid | Bid[], void, any>;
export type GeneratorFn = (props: any) => BTGen;
export type BThreadKey = string | number;

export interface BTContext {
    key?: BThreadKey;
    section: (newValue: string) => void;
}

export interface ExtendResult {
    resolve: Function;
    reject: Function;
    value: any;
}

export enum ExtendResultType {
    guarded = "guarded",
    progress = "progress",
    extendingThread = "extendingThread"
}

type IsBidPlacedFn = (event: string | FCEvent) => boolean
export interface BThreadState {
    section?: string;
    waits?: EventMap<Bid>;
    blocks?: EventMap<Bid>;
    requests?: EventMap<Bid>;
    extends?: EventMap<Bid>;
    pendingRequests: EventMap<PendingEventInfo>;
    pendingExtends: EventMap<PendingEventInfo>;
    pendingEvents: EventMap<PendingEventInfo>;
    isCompleted: boolean;
    isWaitingFor: (event: FCEvent | string) => boolean;
    isBlocking: (event: FCEvent | string) => boolean; 
    isRequesting: (event: FCEvent | string) => boolean;
    isExtending: (event: FCEvent | string) => boolean;
    hasPending: (event: FCEvent | string) => boolean;
}

export class BThread {
    private readonly _logger?: Logger;
    private readonly _dispatch: ActionDispatch;
    private readonly _generatorFn: GeneratorFn;
    private _currentProps: Record<string, any>;
    private _thread: BTGen;
    private _currentBids?: BThreadBids;
    private _nextBid?: any;
    private _pendingRequests: EventMap<PendingEventInfo> = new EventMap();
    private _pendingExtends: EventMap<PendingEventInfo> = new EventMap();
    private _state: BThreadState = {
        section: undefined,
        waits: this._currentBids?.[BidType.wait],
        blocks: this._currentBids?.[BidType.block],
        requests: this._currentBids?.[BidType.request],
        extends: this._currentBids?.[BidType.extend],
        pendingRequests: new EventMap<PendingEventInfo>(),
        pendingExtends: new EventMap<PendingEventInfo>(),
        pendingEvents: new EventMap<PendingEventInfo>(),
        isWaitingFor: (event: FCEvent | string) => !!this._currentBids?.[BidType.wait]?.has(event),
        isBlocking: (event: FCEvent | string) => !!this._currentBids?.[BidType.block]?.has(event),
        isRequesting: (event: FCEvent | string) => !!this._currentBids?.[BidType.request]?.has(event),
        isExtending: (event: FCEvent | string) => !!this._currentBids?.[BidType.extend]?.has(event),
        hasPending: (event: FCEvent | string) => this._state.pendingEvents.has(event),
        isCompleted: false
    };
    public get state() {
        return this._state;
    }
    private _getBTContext(): BTContext {
        const section = (value: string) => {
            this._state.section = value;
        }
        return {
            key: this.key,
            section: section
        };
    }
    public readonly id: string;
    public readonly title?: string;
    public readonly key?: BThreadKey;

    public constructor(id: string, generatorFn: GeneratorFn, props: Record<string, any>, dispatch: ActionDispatch, key?: BThreadKey, logger?: Logger, title?: string) {
        this.id = id;
        this.title = title;
        this.key = key;
        this._dispatch = dispatch;
        this._generatorFn = generatorFn.bind(this._getBTContext());
        this._logger = logger;
        this._currentProps = props;
        this._thread = this._generatorFn(this._currentProps);
        this._processNextBid();
    }

     // --- private

    private _cancelPendingRequests(): EventMap<PendingEventInfo> {
        const clone = this._pendingRequests.clone();
        this._pendingRequests.clear();
        return clone;
    }

    private _setCurrentBids() {
        const pendingExtends: EventMap<PendingEventInfo> = (this._pendingExtends || new EventMap()).clone();
        const pendingRequests: EventMap<PendingEventInfo> = (this._pendingRequests || new EventMap()).clone();
        const pendingEvents: EventMap<PendingEventInfo> = pendingExtends.merge(pendingRequests);
        this._currentBids = getBidsForBThread(this.id, this._nextBid, pendingEvents);
        this._state.pendingExtends = pendingExtends;
        this._state.pendingRequests = pendingRequests;
        this._state.pendingEvents = pendingEvents;
        this._state.waits = this._currentBids?.[BidType.wait];
        this._state.blocks = this._currentBids?.[BidType.block];
        this._state.requests = this._currentBids?.[BidType.request];
        this._state.extends = this._currentBids?.[BidType.extend];
    }

    private _processNextBid(returnValue?: any): EventMap<PendingEventInfo> {
        if(this._state.isCompleted) return this._pendingRequests;
        const cancelledRequests = this._cancelPendingRequests();
        const next = this._thread.next(returnValue);
        if (next.done) {
            this._state.isCompleted = true;
            delete this._state.section;
            delete this._nextBid;
            delete this._currentBids;
            this._pendingExtends.clear();
            this._pendingRequests.clear();
        } else {
            this._nextBid = next.value;
            this._setCurrentBids();
        }
        return cancelledRequests;
    }

    private _progressBThread(bid: Bid, payload: any, isReject = false): void {
        let returnVal;
        if(!isReject) {
            returnVal = this._currentBids && this._currentBids.withMultipleBids ? [bid.event, payload] : payload;
        }   
        const sectionBeforeProgression = this._state.section;
        const cancelledPending = this._processNextBid(returnVal);
        this._logger?.logThreadProgression(this.id, bid, sectionBeforeProgression, cancelledPending, this._state.pendingEvents);
    }

    private _createExtendPromise(bid: Bid, action: Action): ExtendResult {
        let resolveFn: (value?: unknown) => void;
        let rejectFn: (reason?: any) => void;
        new Promise((resolve, reject) => {
            resolveFn = resolve;
            rejectFn = reject;
            }).then((data): void => {
                const pendingInfo = this._pendingExtends.get(bid.event);
                if (pendingInfo?.actionIndex === action.index) {
                    this._dispatch({index: null, type: ActionType.resolved, threadId: this.id, event: bid.event, payload: data, extendedRequestingThreadId: action.extendedRequestingThreadId });
                }
            }).catch((): void => {
                const pendingInfo = this._pendingExtends.get(bid.event);
                if (pendingInfo?.actionIndex === action.index) {
                    this._dispatch({index: null, type: ActionType.rejected, threadId: this.id, event: bid.event });
                }
            });
        this._pendingExtends.set(bid.event, {actionIndex: action.index, event: bid.event, host: this.id, isExtend: true});
        this._setCurrentBids();
        this._logger?.logExtend(bid, this._state.section, this._state.pendingEvents);
        return {
            resolve: (value?: unknown) => { resolveFn(value) }, 
            reject: (reason: any) => { rejectFn(reason) }, 
            value: action.payload
        };
    }


    // --- public

    public getBids(): BThreadBids | undefined {
        return this._currentBids;
    }

    public resetOnPropsChange(nextProps: any): void {
        const changedProps = utils.getChangedProps(this._currentProps, nextProps);
        if (changedProps === undefined) return;
        // reset
        this._setCurrentBids();
        this._currentProps = nextProps;
        this._state.isCompleted = false;
        delete this._state.section;
        this._thread = this._generatorFn(this._currentProps);
        const cancelledRequests = this._processNextBid();
        const cancelledExtends = this._pendingExtends.clone();
        this._pendingExtends.clear();
        this._logger?.logThreadReset(this.id, changedProps, cancelledExtends.merge(cancelledRequests), this._currentProps);
    }

    public addPendingRequest(action: Action): void {    
        this._pendingRequests.set(action.event, {actionIndex: action.index, event: action.event, host: this.id, isExtend: false});
        this._setCurrentBids();
        this._logger?.logPromise(action, this._state.section, this._state.pendingEvents);
        const startTime = new Date().getTime();
        action.payload.then((data: any): void => {
                const pendingEventInfo = this._pendingRequests.get(action.event);
                if (pendingEventInfo?.actionIndex === action.index) {
                    const requestDuration = new Date().getTime() - startTime;
                    this._dispatch({
                        index: action.resolvedActionIndex || null, 
                        type: ActionType.resolved,
                        threadId: this.id,
                        event: action.event,
                        extendedRequestingThreadId: action.extendedRequestingThreadId,
                        payload: data,
                        resolve: {
                            requestedActionIndex: action.index!,
                            requestDuration: requestDuration
                        }
                    });
                }
            })
            .catch((e: Error): void => {
                const pendingEventInfo = this._pendingRequests.get(action.event);
                if (pendingEventInfo?.actionIndex === action.index) {
                    const requestDuration = new Date().getTime() - startTime;
                    this._dispatch({
                        index: action.resolvedActionIndex || null,
                        type: ActionType.rejected,
                        threadId: this.id,
                        event: action.event,
                        payload: e,
                        resolve: {
                            requestedActionIndex: action.index!,
                            requestDuration: requestDuration
                        }
                    });
                }
            });
    }

    public resolvePending(action: Action): boolean {
        if(action.threadId !== this.id || action.type !== ActionType.resolved) return false;
        // resolve extend
        if(this._pendingExtends.delete(action.event)) {
            this._setCurrentBids();
            this._logger?.logExtendResult(BThreadReactionType.extendResolved, this.id, action.event, this._state.pendingEvents);
            return true;
        } 
        // resolve pending promise
        else if(this._pendingRequests.delete(action.event)) {
            this._setCurrentBids();
            return true;
        }
        return false;
    }

    public rejectPending(action: Action): void {
        if(action.threadId !== this.id || action.type !== ActionType.rejected) return;
        // rejection of an extend
        const isExtendDeleted = this._pendingExtends.delete(action.event);
        if(isExtendDeleted) {
            this._setCurrentBids();
            this._logger?.logExtendResult(BThreadReactionType.extendResolved, this.id, action.event, this._state.pendingEvents); // thread is not progressed after this, so a special logging is needed
        }
        // rejection of a pending promise
        else if (this._pendingRequests.delete(action.event) && this._thread && this._thread.throw) {
            this._thread.throw({event: action.event, error: action.payload});
            const bid = this._currentBids?.request?.get(action.event);
            if(!bid) return;
            this._progressBThread(bid, action.payload, true);
        }
    }
    
    public progressRequest(eventCache: EventCache, event: FCEvent, payload: any): void {
        const bid = this._currentBids?.request?.get(event) || this._currentBids?.extend?.get(event);
        if(!bid) return;
        if(bid.subType === BidSubType.set) {
            setEventCache(eventCache, event, payload);
        }
        this._progressBThread(bid, payload);
    }

    public progressWait(bid: Bid, actionPayload: any): void {
        if(!bid || bid.guard && !bid.guard(actionPayload)) return;
        this._progressBThread(bid, actionPayload);
    }

    public progressExtend(action: Action, bid: Bid): ExtendResultType {
        if(!bid || bid.guard && !bid.guard(action.payload)) return ExtendResultType.guarded;
        if((action.type === ActionType.requested || action.type === ActionType.resolved) && action.extendedRequestingThreadId === undefined) action.extendedRequestingThreadId = action.threadId;
        if(bid.payload !== undefined) {
            this._progressBThread(bid, action.payload);
            return ExtendResultType.progress;
        }
        const extendResult = this._createExtendPromise(bid, action);
        this._progressBThread(bid, extendResult);
        return ExtendResultType.extendingThread;
    }

    public destroy(): void {
        this._cancelPendingRequests();
        this._pendingExtends.clear();
        this._pendingRequests.clear();
        delete this._state;
        delete this._thread;
        this._logger?.logOnDestroy(this.id);
    }
}
