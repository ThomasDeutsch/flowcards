import { getBidsForBThread, BThreadBids, BidType, Bid, BidSubType } from './bid';
import * as utils from "./utils";
import { Logger } from "./logger";
import { ActionType, Action } from './action';
import { ActionDispatch} from './update-loop';
import { EventMap, reduceEventMaps, FCEvent, toEvent } from './event';
import { EventCache, setEventCache } from './event-cache';

export type BTGen = Generator<Bid | Bid[], void, any>;
export type GeneratorFn = (props: any) => BTGen;
export type BThreadKey = string | number;

export interface BTContext {
    key?: BThreadKey;
    setSection: (newValue: string) => void;
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
    private _isCompleted = false;
    private _state: BThreadState = {
        waits: this._currentBids?.[BidType.wait],
        blocks: this._currentBids?.[BidType.block],
        section: undefined,
        isWaitingFor: function(event: string | FCEvent): boolean {
           return !!this.waits?.has(toEvent(event));
        },
        isBlocking: function(event: string | FCEvent): boolean {
            return !!this.blocks?.has(toEvent(event));
        }
    };
    public get state() {
        return this._state;
    }
    private _getBTContext(): BTContext {
        const setSection = (value: string) => {
            this._state.section = value;
        }
        return {
            key: this.key,
            setSection: setSection
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

    private _cancelPendingPromises(): FCEvent[] {
        const test = this._pendingRequestRecord.clear();
        return test || [];
    }

    private _processNextBid(returnValue?: any): FCEvent[] {
        if(this._isCompleted) return [];
        const cancelledPending = this._cancelPendingPromises();
        const next = this._thread.next(returnValue);
        if (next.done) {
            this._isCompleted = true;
            delete this._nextBid;
        } else {
            this._nextBid = next.value;
        }
        delete this._currentBids;
        return cancelledPending;
    }

    private _progressBThread(bid: Bid, payload: any, isReject = false): void {
        let returnVal;
        if(!isReject) {
            returnVal = this._currentBids && this._currentBids.withMultipleBids ? [bid.event, payload] : payload;
        }   
        const sectionBeforeProgression = this._state.section;
        const cancelledPending = this._processNextBid(returnVal);
        this._logger?.logThreadProgression(bid, sectionBeforeProgression, cancelledPending);

    }

    private _createExtendPromise(bid: Bid, payload: any): ExtendResult {
        let resolveFn = () => {true};
        let rejectFn = () => {true};
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
        this._logger?.logExtend(bid);
        return {resolve: resolveFn, reject: rejectFn, value: payload};
    }

    // --- public

    public getBids(): BThreadBids  {
        const pendingEvents: EventMap<true> | undefined = reduceEventMaps([this._pendingExtendRecord, this._pendingRequestRecord], () => true);
        if(this._isCompleted) return {[BidType.pending]: pendingEvents};
        if(this._currentBids === undefined) {
            this._currentBids = getBidsForBThread(this.id, this._nextBid);
            this._state.waits = this._currentBids?.[BidType.wait];
            this._state.blocks = this._currentBids?.[BidType.block];
        }
        return {...this._currentBids, [BidType.pending]: pendingEvents};
    }

    public resetOnPropsChange(nextProps: any): void {
        const changedProps = utils.getChangedProps(this._currentProps, nextProps);
        if (changedProps === undefined) return;
        // reset
        this._pendingExtendRecord = new EventMap();
        this._currentProps = nextProps;
        this._isCompleted = false;
        delete this._state.section;
        this._thread = this._generatorFn(this._currentProps);
        const cancelledPending = this._processNextBid();
        this._logger?.logThreadReset(this.id, changedProps, cancelledPending);
    }

    public addPendingRequest(bid: Bid, promise: Promise<any>): void {       
        this._pendingRequestRecord.set(bid.event, promise);
        this._logger?.logPromise(bid);
        const startTime = new Date().getTime();
        promise.then((data): void => {
                const pendingDuration = new Date().getTime() - startTime;
                const recordedPromise = this._pendingRequestRecord.get(bid.event);
                if (recordedPromise  && Object.is(promise, recordedPromise)) {
                    this._dispatch({ type: ActionType.resolved, threadId: this.id, event: bid.event, payload: data, pendingDuration: pendingDuration });
                }
            })
            .catch((e): void => {
                const pendingDuration = new Date().getTime() - startTime;
                const recordedPromise = this._pendingRequestRecord.get(bid.event);
                if (recordedPromise && Object.is(promise, recordedPromise)) {
                    this._dispatch({ type: ActionType.rejected, threadId: this.id, event: bid.event, payload: e, pendingDuration: pendingDuration });
                }
            });
    }

    public resolvePending(action: Action): boolean {
        if(action.threadId !== this.id || action.type !== ActionType.resolved) return false;
        // resolve extend
        if(this._pendingExtendRecord.delete(action.event)) {
            return true;
        } 
        // resolve pending promise
        else if(this._pendingRequestRecord.delete(action.event)) {
            return true;
        }
        return false;
    }

    public rejectPending(action: Action): void {
        if(action.threadId !== this.id || action.type !== ActionType.rejected) return;
        // rejection of an extend
        const isExtendDeleted = this._pendingExtendRecord.delete(action.event);
        // rejection of a pending promise
        if (!isExtendDeleted && this._pendingRequestRecord.delete(action.event) && this._thread && this._thread.throw) {
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
        this._cancelPendingPromises();
        delete this._thread;
    }
}
