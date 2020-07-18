import { getBidsForBThread, BThreadBids, BidType, Bid, BidSubType, PendingEventInfo } from './bid';
import * as utils from "./utils";
import { Logger, BThreadReactionType } from "./logger";
import { ActionType, Action } from './action';
import { ActionDispatch} from './update-loop';
import { EventMap, reduceEventMaps, FCEvent, toEvent } from './event';
import { EventCache, setEventCache } from './event-cache';

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
    waits?: EventMap<Bid>;
    blocks?: EventMap<Bid>;
    section?: string;
    isWaitingFor: IsBidPlacedFn;
    isBlocking: IsBidPlacedFn;
    isCompleted: boolean;
}

export class BThread {
    private readonly _logger?: Logger;
    private readonly _dispatch: ActionDispatch;
    private readonly _generatorFn: GeneratorFn;
    private _currentProps: Record<string, any>;
    private _thread: BTGen;
    private _currentBids?: BThreadBids;
    private _nextBid?: any;
    private _pendingRequestRecord: EventMap<Promise<any>> = new EventMap();
    private _pendingExtendRecord: EventMap<Promise<any>> = new EventMap();
    private _state: BThreadState = {
        waits: this._currentBids?.[BidType.wait],
        blocks: this._currentBids?.[BidType.block],
        section: undefined,
        isWaitingFor: function(event: string | FCEvent): boolean {
           return !!this.waits?.has(toEvent(event));
        },
        isBlocking: function(event: string | FCEvent): boolean {
            return !!this.blocks?.has(toEvent(event));
        },
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

    private _cancelPendingRequests(): FCEvent[] | undefined {
        return this._pendingRequestRecord.clear();
    }

    private _processNextBid(returnValue?: any): FCEvent[] | undefined {
        if(this._state.isCompleted) return [];
        const cancelledRequests = this._cancelPendingRequests();
        const next = this._thread.next(returnValue);
        if (next.done) {
            this._state.isCompleted = true;
            delete this._state.section;
            delete this._nextBid;
            delete this._currentBids
        } else {
            this._nextBid = next.value;
            this._currentBids = getBidsForBThread(this.id, this._nextBid);
        }
        this._updatePendingEventsBid();
        this._state.waits = this._currentBids?.[BidType.wait];
        this._state.blocks = this._currentBids?.[BidType.block];
        return cancelledRequests;
    }

    private _progressBThread(bid: Bid, payload: any, isReject = false): void {
        let returnVal;
        if(!isReject) {
            returnVal = this._currentBids && this._currentBids.withMultipleBids ? [bid.event, payload] : payload;
        }   
        const sectionBeforeProgression = this._state.section;
        const cancelledPending = this._processNextBid(returnVal);
        this._logger?.logThreadProgression(this.id, bid, sectionBeforeProgression, cancelledPending, this._currentBids?.[BidType.pending]?.allEvents);
    }

    private _createExtendPromise(bid: Bid, payload: any): ExtendResult {
        let resolveFn: (value?: unknown) => void;
        let rejectFn: (reason?: any) => void;
        const promise = new Promise((resolve, reject) => {
            resolveFn = resolve;
            rejectFn = reject;
            }).then((data): void => {
                if (this._pendingExtendRecord.has(bid.event)) {
                    this._dispatch({ type: ActionType.resolved, threadId: this.id, event: bid.event, payload: data });
                }
            }).catch((): void => {
                if (this._pendingExtendRecord.has(bid.event)) {
                    this._dispatch({ type: ActionType.rejected, threadId: this.id, event: bid.event });
                }
            });
        this._pendingExtendRecord.set(bid.event, promise);
        this._updatePendingEventsBid();
        this._logger?.logExtend(bid, this._state.section, this._currentBids?.[BidType.pending]?.allEvents);
        return {
            resolve: (value?: unknown) => {resolveFn(value)}, 
            reject: (reason: any) => {rejectFn(reason)}, 
            value: payload
        };
    }

    private _updatePendingEventsBid() {
        const pendingExtends: EventMap<PendingEventInfo> = this._pendingExtendRecord.map(x => ({host: this.id, isExtend: true}));
        const pendingRequests: EventMap<PendingEventInfo> = this._pendingRequestRecord.map(x => ({host: this.id, isExtend: false}));
        const pendingEvents: EventMap<PendingEventInfo> = pendingExtends.merge(pendingRequests);
        if(!pendingEvents) {
            if(this._currentBids) delete this._currentBids[BidType.pending];
            else delete this._currentBids;
        } 
        else {
            this._currentBids = {...(this._currentBids  || {}), [BidType.pending]: pendingEvents}
        }

    }

    // --- public

    public getBids(): BThreadBids | undefined {
        return this._currentBids;
    }

    public resetOnPropsChange(nextProps: any): void {
        const changedProps = utils.getChangedProps(this._currentProps, nextProps);
        if (changedProps === undefined) return;
        // reset
        this._updatePendingEventsBid();
        this._currentProps = nextProps;
        this._state.isCompleted = false;
        delete this._state.section;
        this._thread = this._generatorFn(this._currentProps);
        let cancelledRequests = this._processNextBid();
        let cancelledExtends = this._pendingExtendRecord.allEvents;
        this._pendingExtendRecord.clear();
        this._logger?.logThreadReset(this.id, changedProps, cancelledExtends ? [...(cancelledRequests || []), ...cancelledExtends] : cancelledRequests);
    }

    public addPendingRequest(event: FCEvent, promise: Promise<any>): void {       
        const bid = this._currentBids?.request?.get(event);
        if(!bid) return;
        this._pendingRequestRecord.set(event, promise);
        this._updatePendingEventsBid();
        this._logger?.logPromise(bid, this._state.section, this._currentBids?.[BidType.pending]?.allEvents);
        const startTime = new Date().getTime();
        promise.then((data): void => {
                const pendingDuration = new Date().getTime() - startTime;
                const recordedPromise = this._pendingRequestRecord.get(event);
                if (recordedPromise  && Object.is(promise, recordedPromise)) {
                    this._dispatch({ type: ActionType.resolved, threadId: this.id, event: event, payload: data, pendingDuration: pendingDuration });
                }
            })
            .catch((e): void => {
                const pendingDuration = new Date().getTime() - startTime;
                const recordedPromise = this._pendingRequestRecord.get(event);
                if (recordedPromise && Object.is(promise, recordedPromise)) {
                    this._dispatch({ type: ActionType.rejected, threadId: this.id, event: event, payload: e, pendingDuration: pendingDuration });
                }
            });
    }

    public resolvePending(action: Action): boolean {
        if(action.threadId !== this.id || action.type !== ActionType.resolved) return false;
        // resolve extend
        if(this._pendingExtendRecord.delete(action.event)) {
            this._updatePendingEventsBid();
            this._logger?.logExtendResult(BThreadReactionType.extendResolved, this.id, action.event, this._currentBids?.[BidType.pending]?.allEvents);
            return true;
        } 
        // resolve pending promise
        else if(this._pendingRequestRecord.delete(action.event)) {
            this._updatePendingEventsBid();
            return true;
        }
        return false;
    }


    public rejectPending(action: Action): void {
        if(action.threadId !== this.id || action.type !== ActionType.rejected) return;
        // rejection of an extend
        const isExtendDeleted = this._pendingExtendRecord.delete(action.event);
        if(isExtendDeleted) {
            this._updatePendingEventsBid();
            this._logger?.logExtendResult(BThreadReactionType.extendResolved, this.id, action.event, this._currentBids?.[BidType.pending]?.allEvents); // thread is not progressed after this, so a special logging is needed
        }
        // rejection of a pending promise
        else if (this._pendingRequestRecord.delete(action.event) && this._thread && this._thread.throw) {
            this._thread.throw({event: action.event, error: action.payload});
            const bid = this._currentBids?.request?.get(action.event);
            if(!bid) return;
            this._progressBThread(bid, action.payload, true);
        }
    }
    
    public progressRequest(eventCache: EventCache, action: Action): void {
        const bid = this._currentBids?.request?.get(action.event);
        if(!bid) return;
        if(bid.subType === BidSubType.set) {
            setEventCache(eventCache, action.event, action.payload);
        }
        this._progressBThread(bid, action.payload);
    }

    public progressWait(bid: Bid, actionPayload: any): void {
        if(!bid || bid.guard && !bid.guard(actionPayload)) return;
        this._progressBThread(bid, actionPayload);
    }

    public progressExtend(action: Action, bid: Bid): ExtendResultType {
        if(!bid || bid.guard && !bid.guard(action.payload)) return ExtendResultType.guarded;
        if(bid.payload !== undefined) {
            this._progressBThread(bid, action.payload);
            return ExtendResultType.progress;
        }
        const extendResult = this._createExtendPromise(bid, action.payload);
        this._progressBThread(bid, extendResult);
        return ExtendResultType.extendingThread;
    }

    public onDelete(): void {
        this._cancelPendingRequests();
        delete this._pendingExtendRecord;
        delete this._state;
        delete this._thread;
    }
}
