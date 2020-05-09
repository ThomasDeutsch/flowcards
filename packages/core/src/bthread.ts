import { getBidsForBThread, BThreadBids, BidType, Bid } from './bid';
import * as utils from "./utils";
import { Logger } from "./logger";
import { ActionType, Action } from './action';
import { ReactionType } from './reaction';
import { ActionDispatch} from './update-loop';
import { EventMap, reduceEventMaps, FCEvent } from './event';

type BidFunction = () => Bid | Bid[]
export type BTGen = Generator<Bid | Bid[] | BidFunction, void, any>;
export type GeneratorFn = (...args: any[]) => BTGen;

export interface BThreadState {
    isCompleted: boolean;
    current?: any;
}

export interface BTContext {
    key?: string | number;
    setState: Function;
    state: BThreadState;
}

export interface InterceptResult {
    resolve: Function;
    reject: Function;
    value: any;
}

interface NextBid {
    isFunction: boolean;
    value?: any;
}

export enum InterceptResultType {
    guarded = "guarded",
    progress = "progress",
    interceptingThread = "interceptingThread"
}

type StateUpdateFunction = (previousState: any) => void;

export class BThread {
    // private
    private readonly _logger?: Logger;
    private readonly _dispatch: ActionDispatch;
    private readonly _generatorFn: GeneratorFn;
    private _currentArguments: any[];
    private _thread: BTGen;
    private _currentBids?: BThreadBids;
    private _nextBid: NextBid = {isFunction: false};
    private _pendingRequestRecord: EventMap<Promise<any>> = new EventMap();
    private _pendingInterceptRecord: EventMap<Promise<any>> = new EventMap();
    private _isCompleted: boolean = false;
    private _stateValue?: any;
    private _stateRef: BThreadState = { 
        isCompleted: this._isCompleted,
        current: undefined
    };
    private _getBTContext(): BTContext {
        return {
            key: this.key,
            setState: (newState: any | StateUpdateFunction): void => {
                if(typeof newState === `function`) {
                    this._stateValue = newState(this._stateValue);
                } else {
                    this._stateValue = newState;
                }
            },
            state: this.state
        };
    }
    // public
    public readonly id: string;
    public readonly key?: string | number;
    public get state(): BThreadState {
        this._stateRef.isCompleted = this._isCompleted;
        this._stateRef.current = this._stateValue;
        return this._stateRef;
    }

    public constructor(id: string, generatorFn: GeneratorFn, args: any[], dispatch: ActionDispatch, key?: string | number, logger?: Logger) {
        this.id = id;
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
            delete this._nextBid.value;
        } else {
            this._nextBid = {value: next.value, isFunction: typeof next.value === 'function'};
        }
        delete this._currentBids;
        return cancelledPromises;
    }

    private _progressBThread(event: FCEvent, payload: any, isReject: boolean = false): void {
        let returnVal;
        if(!isReject) {
            returnVal = this._currentBids && this._currentBids.withMultipleBids ? [event, payload] : payload;
        }
        const cancelledPromises = this._processNextBid(returnVal);
        this._logger?.logReaction(this.id, ReactionType.progress, cancelledPromises);
    }

    private _createInterceptPromise(action: Action): InterceptResult {
        let resolveFn = () => {};
        let rejectFn = () => {};
        const promise = new Promise((resolve, reject) => {
            resolveFn = resolve;
                rejectFn = reject;
            }).then((data): void => {
                if (this._pendingInterceptRecord.delete(action.event)) {
                    this._dispatch({ type: ActionType.resolved, threadId: this.id, event: action.event, payload: data });
                }
            }).catch((): void => {
                if (this._pendingInterceptRecord.delete(action.event)) {
                    this._dispatch({ type: ActionType.rejected, threadId: this.id, event: action.event });
                }
            });
        this._pendingInterceptRecord.set(action.event, promise);
        return {resolve: resolveFn, reject: rejectFn, value: action.payload};
    }

    // --- public

    public getBids(): BThreadBids  {
        const pendingEvents: EventMap<Bid> | undefined = reduceEventMaps([this._pendingInterceptRecord, this._pendingRequestRecord], (acc, curr, event) => ({type: BidType.pending, threadId: this.id, event: event}));
        if(this._isCompleted) return {[BidType.pending]: pendingEvents}
        if(this._nextBid.isFunction) this._currentBids = getBidsForBThread(this.id, this._nextBid.value());
        if(this._currentBids === undefined) this._currentBids = getBidsForBThread(this.id, this._nextBid.value);
        return {...this._currentBids, [BidType.pending]: pendingEvents}
    }

    public resetOnArgsChange(nextArguments: any): void {
        if (utils.areInputsEqual(this._currentArguments, nextArguments)) return;
        this._isCompleted = false;
        this._currentArguments = nextArguments;
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

    public resolvePending(action: Action): void {
        if(action.threadId !== this.id || action.type !== ActionType.resolved) return;
        // resolve intercept
        if(this._pendingInterceptRecord.delete(action.event)) {
            this._logger?.logReaction(this.id, ReactionType.resolve);
        } // resolve pending promise
        else if(this._pendingRequestRecord.delete(action.event)) {
            this._logger?.logReaction(this.id, ReactionType.resolve);
        }
    }

    public rejectPending(action: Action): void {
        if(action.threadId !== this.id || action.type !== ActionType.rejected) return;
        // rejection of an intercept
        if(this._pendingInterceptRecord.delete(action.event)) { 
            this._logger?.logReaction(this.id, ReactionType.reject);
        } // rejection of a pending promise
        else if (this._pendingRequestRecord.delete(action.event) && this._thread && this._thread.throw) {
            this._logger?.logReaction(this.id, ReactionType.reject);
            this._thread.throw({event: action.event, error: action.payload});
            this._progressBThread(action.event, action.payload, true);
        }
    }
    
    public progressRequest(action: Action, bid?: Bid): void {
        this._progressBThread(bid?.event || action.event, action.payload);
    }

    public progressWait(action: Action, bid: Bid): void {
        if(!bid || bid.guard && !bid.guard(action.payload)) return;
        this._progressBThread(bid.event, action.payload);
    }

    public progressIntercept(action: Action, bid: Bid): InterceptResultType {
        if(!bid || bid.guard && !bid.guard(action.payload)) return InterceptResultType.guarded;
        if(bid.payload !== undefined) {
            this._progressBThread(bid.event, action.payload);
            return InterceptResultType.progress;
        }
        this._progressBThread(action.event, this._createInterceptPromise(action));
        return InterceptResultType.interceptingThread;
    }

    public onDelete(): void {
        this._cancelPendingPromises();
        delete this._thread;
    }
}
