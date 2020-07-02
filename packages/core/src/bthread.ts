import { getBidsForBThread, BThreadBids, BidType, Bid } from './bid';
import * as utils from "./utils";
import { Logger } from "./logger";
import { ActionType, Action } from './action';
import { ReactionType } from './reaction';
import { ActionDispatch} from './update-loop';
import { EventMap, reduceEventMaps, FCEvent, toEvent } from './event';

export type BTGen = Generator<Bid | Bid[], void, any>;
export type GeneratorFn = (...args: any[]) => BTGen;
type SetState = (newValue: any) => void;

export interface BTContext {
    key?: string | number;
    setState: SetState;
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

type IsWaitingFunction = (event: string | FCEvent) => boolean
export interface BThreadState {
    waits?: FCEvent[],
    current?: any
    isWaitingFor: IsWaitingFunction
}

export class BThread {
    private readonly _logger?: Logger;
    private readonly _dispatch: ActionDispatch;
    private readonly _generatorFn: GeneratorFn;
    private _currentArguments: any[];
    private _thread: BTGen;
    private _currentBids?: BThreadBids;
    private _nextBid?: any;
    private _pendingRequestRecord: EventMap<Promise<any>> = new EventMap();
    private _pendingExtendRecord: EventMap<Promise<any>> = new EventMap();
    private _isCompleted = false;
    private _state: BThreadState = {
        waits: undefined,
        isWaitingFor: function(event: string | FCEvent): boolean {
            const fcevent = toEvent(event);
            return !!this.waits?.some(e => (e.name === fcevent.name) && (e.key === fcevent.key) );
        },
        current: undefined
    };
    public get state() {
        return this._state;
    }
    private _getBTContext(): BTContext {
        const setState = (value: any) => {
            this._state.current = value;
        }
        return {
            key: this.key,
            setState: setState
        };
    }
    public readonly id: string;
    public readonly title?: string;
    public readonly key?: string | number;


    public constructor(id: string, generatorFn: GeneratorFn, args: any[], dispatch: ActionDispatch, key?: string | number, logger?: Logger, title?: string) {
        this.id = id;
        this.title = title;
        this.key = key;
        this._dispatch = dispatch;
        this._generatorFn = generatorFn.bind(this._getBTContext());
        this._logger = logger;
        this._currentArguments = args;
        this._thread = this._generatorFn(...this._currentArguments);
        this._processNextBid();
        this._logger?.logReaction(this.id, ReactionType.init);
    }

     // --- private

    private _cancelPendingPromises(): FCEvent[] {
        const test = this._pendingRequestRecord.clear();
        return test || [];
    }

    private _processNextBid(returnValue?: any): FCEvent[] {
        if(this._isCompleted) return [];
        const cancelledPromises = this._cancelPendingPromises();
        const next = this._thread.next(returnValue);
        if (next.done) {
            this._isCompleted = true;
            delete this._nextBid;
        } else {
            this._nextBid = next.value;
        }
        delete this._currentBids;
        return cancelledPromises;
    }

    private _progressBThread(event: FCEvent, payload: any, isReject = false): void {
        let returnVal;
        if(!isReject) {
            returnVal = this._currentBids && this._currentBids.withMultipleBids ? [event, payload] : payload;
        }
        const cancelledPromises = this._processNextBid(returnVal);
        this._logger?.logReaction(this.id, ReactionType.progress, cancelledPromises);
    }

    private _createExtendPromise(action: Action): ExtendResult {
        let resolveFn = () => {true};
        let rejectFn = () => {true};
        const promise = new Promise((resolve, reject) => {
            resolveFn = resolve;
                rejectFn = reject;
            }).then((data): void => {
                if (this._pendingExtendRecord.has(action.event)) {
                    this._dispatch({ type: ActionType.resolved, threadId: this.id, event: action.event, payload: data });
                }
            }).catch((): void => {
                if (this._pendingExtendRecord.has(action.event)) {
                    this._dispatch({ type: ActionType.rejected, threadId: this.id, event: action.event });
                }
            });
        this._pendingExtendRecord.set(action.event, promise);
        return {resolve: resolveFn, reject: rejectFn, value: action.payload};
    }

    // --- public

    public getBids(): BThreadBids  {
        const pendingEvents: EventMap<Bid> | undefined = reduceEventMaps([this._pendingExtendRecord, this._pendingRequestRecord], (acc, curr, event) => ({type: BidType.pending, threadId: this.id, event: event}));
        if(this._isCompleted) return {[BidType.pending]: pendingEvents};
        if(this._currentBids === undefined) this._currentBids = getBidsForBThread(this.id, this._nextBid);
        this._state.waits = this._currentBids?.[BidType.wait]?.getAllEvents();
        return {...this._currentBids, [BidType.pending]: pendingEvents};
    }

    public resetOnArgsChange(nextArguments: any): void {
        if (utils.areInputsEqual(this._currentArguments, nextArguments)) return;
        // reset
        this._pendingExtendRecord = new EventMap();
        this._currentArguments = nextArguments;
        this._isCompleted = false;
        delete this._state.current;
        this._thread = this._generatorFn(...this._currentArguments);
        const cancelledPromises = this._processNextBid();
        this._logger?.logReaction(this.id, ReactionType.reset, cancelledPromises);
    }

    public addPendingRequest(event: FCEvent, promise: Promise<any>): void {
        this._pendingRequestRecord.set(event, promise);
        promise.then((data): void => {
                const recordedPromise = this._pendingRequestRecord.get(event);
                if (recordedPromise  && Object.is(promise, recordedPromise)) {
                    this._dispatch({ type: ActionType.resolved, threadId: this.id, event: event, payload: data });
                }
            })
            .catch((e): void => {
                const recordedPromise = this._pendingRequestRecord.get(event);
                if (recordedPromise && Object.is(promise, recordedPromise)) {
                    this._dispatch({ type: ActionType.rejected, threadId: this.id, event: event, payload: e });
                }
            });
        this._logger?.logReaction(this.id, ReactionType.promise);
    }

    public resolvePending(action: Action): boolean {
        if(action.threadId !== this.id || action.type !== ActionType.resolved) return false;
        // resolve extend
        if(this._pendingExtendRecord.delete(action.event)) {
            this._logger?.logReaction(this.id, ReactionType.resolve);
            return true;
        } 
        // resolve pending promise
        else if(this._pendingRequestRecord.delete(action.event)) {
            this._logger?.logReaction(this.id, ReactionType.resolve);
            return true;
        }
        return false;
    }

    public rejectPending(action: Action): void {
        if(action.threadId !== this.id || action.type !== ActionType.rejected) return;
        // rejection of an extend
        if(this._pendingExtendRecord.delete(action.event)) { 
            this._logger?.logReaction(this.id, ReactionType.reject);
        } 
        // rejection of a pending promise
        else if (this._pendingRequestRecord.delete(action.event) && this._thread && this._thread.throw) {
            this._logger?.logReaction(this.id, ReactionType.reject);
            this._thread.throw({event: action.event, error: action.payload});
            this._progressBThread(action.event, action.payload, true);
        }
    }
    
    public progressRequest(action: Action): void {
        this._progressBThread(action.event, action.payload);
    }

    public progressWait(action: Action, bid: Bid): void {
        if(!bid || bid.guard && !bid.guard(action.payload)) return;
        this._progressBThread(bid.event, action.payload);
    }

    public progressExtend(action: Action, bid: Bid): ExtendResultType {
        if(!bid || bid.guard && !bid.guard(action.payload)) return ExtendResultType.guarded;
        if(bid.payload !== undefined) {
            this._progressBThread(bid.event, action.payload);
            return ExtendResultType.progress;
        }
        this._progressBThread(action.event, this._createExtendPromise(action));
        return ExtendResultType.extendingThread;
    }

    public onDelete(): void {
        this._cancelPendingPromises();
        delete this._thread;
    }
}
