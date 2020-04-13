/* eslint-disable @typescript-eslint/no-explicit-any */

import { getBidsForBThread, BidsByType, BidType, BidsForBThread, EventName } from './bid';
import * as utils from "./utils";
import { Logger } from "./logger";
import { ActionType, Action } from './action';
import { ReactionType } from './reaction';
import { ActionDispatch} from './update-loop';

export type ThreadGen = any; // TODO: Better typing for this generator

export interface BThreadState {
    isCompleted: boolean;
    pendingEvents: Set<string>;
    value?: any;
}

export interface BTContext {
    key: string | number | null;
    setState: Function;
    state: BThreadState;
}

export interface InterceptResult {
    resolve: Function;
    reject: Function;
    value: any;
}

type StateUpdateFunction = (previousState: any) => void;

export class BThread {
    public readonly id: string;
    public readonly key: string | number | null = null;
    private readonly _logger?: Logger;
    private readonly _dispatch: ActionDispatch;
    private readonly _generator: ThreadGen;
    private _currentArguments: any[];
    private _thread: IterableIterator<any>;
    private _currentBids: BidsForBThread | null = null;
    private _nextBid: any;
    private _pendingRequestByEventName: Record<EventName, Promise<any>> = {};
    private _pendingInterceptByEventName: Record<EventName, Promise<any>> = {};
    private _isCompleted: boolean = false;
    private _stateValue?: any;
    private _stateRef: BThreadState = { isCompleted: this._isCompleted, pendingEvents: new Set() };
    public get state(): BThreadState {
        this._stateRef.isCompleted = this._isCompleted;
        this._stateRef.pendingEvents = new Set([...Object.keys(this._pendingRequestByEventName), ...Object.keys(this._pendingInterceptByEventName)]);
        this._stateRef.value = this._stateValue;
        return this._stateRef;
    }

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

    public constructor(id: string, generator: ThreadGen, args: any[], dispatch: ActionDispatch, key?: string | number, logger?: Logger) {
        this.id = id;
        if (key || key === 0) this.key = key;
        this._dispatch = dispatch;
        this._generator = generator.bind(this._getBTContext());
        this._logger = logger;
        this._currentArguments = args;
        this._thread = this._generator(...this._currentArguments);
        this._processNextBid();
        if (this._logger) this._logger.logReaction(this.id, ReactionType.init);
    }


    private _cancelPendingPromises(): string[] {
        const cancelledPromises: string[] = [];
        const eventNames = Object.keys(this._pendingRequestByEventName);
        if (eventNames.length > 0) {   
            eventNames.forEach((eventName):void => {
                delete this._pendingRequestByEventName[eventName];
                cancelledPromises.push(eventName);
            });
        }
        return cancelledPromises;
    }

    private _processNextBid(returnValue?: any): string[] {
        if(this._isCompleted) return [];
        const cancelledPromises = this._cancelPendingPromises();
        const next = this._thread.next(returnValue);
        if (next.done) {
            this._isCompleted = true;
            this._nextBid = null;
        } else {
            this._nextBid = next.value;
        }
        return cancelledPromises;
    }

    private _progressBThread(eventName: string, payload: any, isReject: boolean = false): void {
        let returnVal = null;
        if(!isReject) {
            returnVal = this._currentBids && this._currentBids.withMultipleBids ? [eventName, payload] : payload;
        }
        const cancelledPromises = this._processNextBid(returnVal);
        if (this._logger) this._logger.logReaction(this.id, ReactionType.progress, cancelledPromises);
    }

    private _hasCurrentBidForBidTypeAndEventName(bidType: BidType, eventName: string) {
        return (this._currentBids && this._currentBids.bidsByType[bidType][eventName])
    }

    // --- public

    public getBids(): BidsByType | null {
        if(typeof this._nextBid === 'function') {
            this._currentBids = getBidsForBThread(this.id, this._nextBid(), this.state.pendingEvents);
        } else {
            this._currentBids = getBidsForBThread(this.id, this._nextBid, this.state.pendingEvents);
        }
        return this._currentBids ? this._currentBids.bidsByType : null;
    }

    public resetOnArgsChange(nextArguments: any): void {
        if (utils.areInputsEqual(this._currentArguments, nextArguments)) return;
        this._isCompleted = false;
        this._currentArguments = nextArguments;
        this._thread = this._generator(...this._currentArguments);
        const cancelledPromises = this._processNextBid();
        if (this._logger) this._logger.logReaction(this.id, ReactionType.reset, cancelledPromises);
    }

    public addPendingRequest(eventName: string, promise: Promise<any>): void {
        this._pendingRequestByEventName[eventName] = promise;
        this._pendingRequestByEventName[eventName]
            .then((data): void => {
                if (this._pendingRequestByEventName[eventName] && Object.is(promise, this._pendingRequestByEventName[eventName])) {
                    this._dispatch({ type: ActionType.resolved, threadId: this.id, eventName: eventName, payload: data });
                }
            })
            .catch((e): void => {
                if (this._pendingRequestByEventName[eventName] && Object.is(promise, this._pendingRequestByEventName[eventName])) {
                    this._dispatch({ type: ActionType.rejected, threadId: this.id, eventName: eventName, payload: e });
                }
            });
        if (this._logger) this._logger.logReaction(this.id, ReactionType.promise, null);
    }

    public resolvePending(action: Action): void {
        if(action.threadId !== this.id || action.type !== ActionType.resolved) return;
        // resolve intercept
        if(this._pendingInterceptByEventName[action.eventName]) {
            delete this._pendingInterceptByEventName[action.eventName];
            if (this._logger) this._logger.logReaction(this.id, ReactionType.resolve);
        } // resolve pending promise
        else if(this._pendingRequestByEventName[action.eventName]) {
            delete this._pendingRequestByEventName[action.eventName];
            if (this._logger) this._logger.logReaction(this.id, ReactionType.resolve);
        }
    }

    public rejectPending(action: Action): void {
        if(action.threadId !== this.id || action.type !== ActionType.rejected) return;
        // rejection of an intercept
        if(this._pendingInterceptByEventName[action.eventName]) { 
            delete this._pendingInterceptByEventName[action.eventName];
            if (this._logger) this._logger.logReaction(this.id, ReactionType.reject);
        } // rejection of a pending promise
        else if (this._pendingRequestByEventName[action.eventName] && this._thread && this._thread.throw) {
            delete this._pendingRequestByEventName[action.eventName];
            if (this._logger) this._logger.logReaction(this.id, ReactionType.reject);
            this._thread.throw({eventName: action.eventName, error: action.payload});
            this._progressBThread(action.eventName, action.payload, true);
        }
    }
    
    public progressRequest(action: Action): void {
        if(this._hasCurrentBidForBidTypeAndEventName(BidType.request, action.eventName)) {
            this._progressBThread(action.eventName, action.payload);
        }
    }

    public progressWait(action: Action): void {
        if(!this._hasCurrentBidForBidTypeAndEventName(BidType.wait, action.eventName)) return;
        const guard = this._currentBids!.bidsByType[BidType.wait][action.eventName].guard;
        if(guard && !guard(action.payload)) return;
        this._progressBThread(action.eventName, action.payload);
    }

    public progressIntercept(action: Action): boolean {
        if(!this._hasCurrentBidForBidTypeAndEventName(BidType.intercept, action.eventName)) return false;
        const guard = this._currentBids!.bidsByType[BidType.intercept][action.eventName].guard;
        if(guard && !guard(action.payload)) return false;
        const createPromise = (): InterceptResult => {
            let resolveFn = () => {};
            let rejectFn = () => {};
            this._pendingInterceptByEventName[action.eventName] = new Promise((resolve, reject) => {
                resolveFn = resolve;
                rejectFn = reject;
            }).then((data): void => {
                if (this._pendingInterceptByEventName[action.eventName]) {
                    delete this._pendingInterceptByEventName[action.eventName];
                    this._dispatch({ type: ActionType.resolved, threadId: this.id, eventName: action.eventName, payload: data });
                }
            }).catch((): void => {
                if (this._pendingInterceptByEventName[action.eventName]) {
                    delete this._pendingInterceptByEventName[action.eventName];
                    this._dispatch({ type: ActionType.rejected, threadId: this.id, eventName: action.eventName });
                }
            });
            return {resolve: resolveFn, reject: rejectFn, value: action.payload};
        }
        this._progressBThread(action.eventName, createPromise());
        return true; // was intercepted
    }

    public onDelete(): void {
        this._cancelPendingPromises();
        delete this._thread;
    }
}
