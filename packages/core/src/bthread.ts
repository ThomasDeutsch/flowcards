import { Action, ActionType } from './action';
import {
    Bid, BidSubType, BidType, BThreadBids, getBidsForBThread, PendingEventInfo
} from './bid';
import { EventMap, FCEvent } from './event';
import { EventCache, setEventCache } from './event-cache';
import { Logger } from './logger';
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
    promise: Promise<unknown>;
}

type IsBidPlacedFn = (event: string | FCEvent) => boolean
export interface BThreadState {
    section?: string;
    waits: EventMap<Bid>;
    blocks: EventMap<Bid>;
    requests: EventMap<Bid>;
    extends: EventMap<Bid>;
    pendingRequests: EventMap<PendingEventInfo>;
    isCompleted: boolean;
}

export class BThread {
    public readonly id: string;
    public readonly title?: string;
    public readonly key?: BThreadKey;
    private readonly _logger?: Logger;
    private readonly _dispatch: ActionDispatch;
    private readonly _generatorFn: GeneratorFn;
    private _currentProps: Record<string, any>;
    private _thread: BTGen;
    private _currentBids?: BThreadBids;
    public get currentBids() { return this._currentBids; }
    private _nextBid?: any;
    private _pendingRequests: EventMap<PendingEventInfo> = new EventMap();
    private _state: BThreadState = {
        section: undefined,
        waits: this._currentBids?.[BidType.wait] || new EventMap(),
        blocks: this._currentBids?.[BidType.block] || new EventMap(),
        requests: this._currentBids?.[BidType.request] || new EventMap(),
        extends: this._currentBids?.[BidType.extend] || new EventMap(),
        pendingRequests: new EventMap<PendingEventInfo>(),
        isCompleted: false
    };
    public get state() { return this._state; }

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

     private _getBTContext(): BTContext {
        const section = (value: string) => {
            this._state.section = value;
        }
        return {
            key: this.key,
            section: section
        };
    }

    private _cancelPendingRequests(): EventMap<PendingEventInfo> {
        const clone = this._pendingRequests.clone();
        this._pendingRequests.clear();
        return clone;
    }

    private _setCurrentBids() {
        this._state.pendingRequests = this._pendingRequests.clone();
        this._currentBids = getBidsForBThread(this.id, this._nextBid, this._state.pendingRequests);
        this._state.waits = this._currentBids?.[BidType.wait] || new EventMap();
        this._state.blocks = this._currentBids?.[BidType.block] || new EventMap();
        this._state.requests = this._currentBids?.[BidType.request] || new EventMap();
        this._state.extends = this._currentBids?.[BidType.extend] || new EventMap();
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
        this._logger?.logThreadProgression(this.id, bid, sectionBeforeProgression, cancelledPending, this._pendingRequests);
    }

    private _createExtendPromise(bid: Bid, action: Action): ExtendResult {
        let resolveFn: (value?: unknown) => void;
        let rejectFn: (reason?: any) => void;
        const promise = new Promise((resolve, reject) => {
            resolveFn = resolve;
            rejectFn = reject;
        });
        this._logger?.logExtend(bid, this._state.section, this._pendingRequests);
        return {
            resolve: (value?: unknown) => { resolveFn(value) }, 
            reject: (reason: any) => { rejectFn(reason) }, 
            value: action.payload,
            promise: promise
        };
    }

    // --- public

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
        this._logger?.logThreadReset(this.id, changedProps, cancelledRequests, this._currentProps);
    }

    public addPendingRequest(action: Action): void {    
        this._pendingRequests.set(action.event, {actionIndex: action.index, event: action.event, host: this.id, isExtend: false});
        this._setCurrentBids();
        this._logger?.logPromise(action, this._state.section, this._pendingRequests);
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
                    extendedByThreadId: action.extendedByThreadId,
                    payload: data,
                    resolve: {
                        requestedActionIndex: action.index!,
                        requestDuration: requestDuration
                    }
                });
            }
        }).catch((e: Error): void => {
            const pendingEventInfo = this._pendingRequests.get(action.event);
            if (pendingEventInfo?.actionIndex === action.index) {
                const requestDuration = new Date().getTime() - startTime;
                this._dispatch({
                    index: action.resolvedActionIndex || null,
                    type: ActionType.rejected,
                    threadId: this.id,
                    event: action.event,
                    extendedByThreadId: action.extendedByThreadId,
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
        else if(this._pendingRequests.delete(action.event)) {
            this._setCurrentBids();
            return true;
        }
        return false;
    }

    public rejectPending(action: Action): void {
        if(action.threadId !== this.id || action.type !== ActionType.rejected) return;
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

    public progressExtend(action: Action, bid: Bid): Promise<unknown> | undefined {
        if(!bid || bid.guard && !bid.guard(action.payload)) return undefined;
        const extendResult = this._createExtendPromise(bid, action);
        this._progressBThread(bid, extendResult);
        return extendResult.promise;
    }

    public destroy(): void {
        this._cancelPendingRequests();
        this._pendingRequests.clear();
        delete this._state;
        delete this._thread;
        this._logger?.logOnDestroy(this.id);
    }
}
