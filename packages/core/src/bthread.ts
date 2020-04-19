/* eslint-disable @typescript-eslint/no-explicit-any */

import { getBidsForBThread, BidsByType, BidType, eventId } from './bid';
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

interface NextBid {
    isFunction: boolean;
    value: any;
}

export interface BThreadBids {
    pendingEvents: Set<string> | null;
    bidsByType: BidsByType | null;
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
    private _currentBids: BidsByType | null = null;
    private _nextBid: NextBid = {isFunction: false, value: null};
    private _pendingRequestByeventId: Record<eventId, Promise<any>> = {};
    private _pendingInterceptByeventId: Record<eventId, Promise<any>> = {};
    private _isCompleted: boolean = false;
    private _stateValue?: any;
    private _stateRef: BThreadState = { isCompleted: this._isCompleted, pendingEvents: new Set() };
    public get state(): BThreadState {
        this._stateRef.isCompleted = this._isCompleted;
        this._stateRef.pendingEvents = new Set([...Object.keys(this._pendingRequestByeventId), ...Object.keys(this._pendingInterceptByeventId)]);
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
        const eventIds = Object.keys(this._pendingRequestByeventId);
        if (eventIds.length > 0) {   
            eventIds.forEach((eventId):void => {
                delete this._pendingRequestByeventId[eventId];
                cancelledPromises.push(eventId);
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
            this._nextBid.value = null;
        } else {
            this._nextBid = {value: next.value, isFunction: typeof next.value === 'function'};
        }
        this._currentBids = null;
        return cancelledPromises;
    }

    private _progressBThread(eventId: string, payload: any, isReject: boolean = false): void {
        let returnVal = null;
        if(!isReject) {
            returnVal = this._currentBids && this._currentBids.withMultipleBids ? [eventId, payload] : payload;
        }
        const cancelledPromises = this._processNextBid(returnVal);
        if (this._logger) this._logger.logReaction(this.id, ReactionType.progress, cancelledPromises);
    }

    private _hasCurrentBidForBidTypeAndeventId(bidType: BidType, eventId: string) {
        return (this._currentBids && this._currentBids[bidType][eventId])
    }

    // --- public

    public getBids(): BThreadBids {
        const pendingEvents = this.state.pendingEvents.size ? this.state.pendingEvents : null;
        if(this._isCompleted) return {
            pendingEvents: pendingEvents,
            bidsByType: null
        }
        if(this._nextBid.isFunction) this._currentBids = getBidsForBThread(this.id, this._nextBid.value());
        if(this._currentBids === null) this._currentBids = getBidsForBThread(this.id, this._nextBid.value);
        return {
            pendingEvents: pendingEvents,
            bidsByType: this._currentBids
        }
    }

    public resetOnArgsChange(nextArguments: any): void {
        if (utils.areInputsEqual(this._currentArguments, nextArguments)) return;
        this._isCompleted = false;
        this._currentArguments = nextArguments;
        this._thread = this._generator(...this._currentArguments);
        const cancelledPromises = this._processNextBid();
        if (this._logger) this._logger.logReaction(this.id, ReactionType.reset, cancelledPromises);
    }

    public addPendingRequest(eventId: string, promise: Promise<any>): void {
        this._pendingRequestByeventId[eventId] = promise;
        this._pendingRequestByeventId[eventId]
            .then((data): void => {
                if (this._pendingRequestByeventId[eventId] && Object.is(promise, this._pendingRequestByeventId[eventId])) {
                    this._dispatch({ type: ActionType.resolved, threadId: this.id, eventId: eventId, payload: data });
                }
            })
            .catch((e): void => {
                if (this._pendingRequestByeventId[eventId] && Object.is(promise, this._pendingRequestByeventId[eventId])) {
                    this._dispatch({ type: ActionType.rejected, threadId: this.id, eventId: eventId, payload: e });
                }
            });
        if (this._logger) this._logger.logReaction(this.id, ReactionType.promise, null);
    }

    public resolvePending(action: Action): void {
        if(action.threadId !== this.id || action.type !== ActionType.resolved) return;
        // resolve intercept
        if(this._pendingInterceptByeventId[action.eventId]) {
            delete this._pendingInterceptByeventId[action.eventId];
            if (this._logger) this._logger.logReaction(this.id, ReactionType.resolve);
        } // resolve pending promise
        else if(this._pendingRequestByeventId[action.eventId]) {
            delete this._pendingRequestByeventId[action.eventId];
            if (this._logger) this._logger.logReaction(this.id, ReactionType.resolve);
        }
    }

    public rejectPending(action: Action): void {
        if(action.threadId !== this.id || action.type !== ActionType.rejected) return;
        // rejection of an intercept
        if(this._pendingInterceptByeventId[action.eventId]) { 
            delete this._pendingInterceptByeventId[action.eventId];
            if (this._logger) this._logger.logReaction(this.id, ReactionType.reject);
        } // rejection of a pending promise
        else if (this._pendingRequestByeventId[action.eventId] && this._thread && this._thread.throw) {
            delete this._pendingRequestByeventId[action.eventId];
            if (this._logger) this._logger.logReaction(this.id, ReactionType.reject);
            this._thread.throw({eventId: action.eventId, error: action.payload});
            this._progressBThread(action.eventId, action.payload, true);
        }
    }
    
    public progressRequest(action: Action): void {
        if(this._hasCurrentBidForBidTypeAndeventId(BidType.request, action.eventId)) {
            this._progressBThread(action.eventId, action.payload);
        }
    }

    public progressWait(action: Action): void {
        if(!this._hasCurrentBidForBidTypeAndeventId(BidType.wait, action.eventId)) return;
        const guard = this._currentBids && this._currentBids[BidType.wait][action.eventId].guard;
        if(guard && !guard(action.payload)) return;
        this._progressBThread(action.eventId, action.payload);
    }

    public progressIntercept(action: Action): boolean {
        if(!this._hasCurrentBidForBidTypeAndeventId(BidType.intercept, action.eventId)) return false;
        const guard = this._currentBids && this._currentBids[BidType.intercept][action.eventId].guard;
        if(guard && !guard(action.payload)) return false;
        const createInterceptPromise = (): InterceptResult => {
            let resolveFn = () => {};
            let rejectFn = () => {};
            this._pendingInterceptByeventId[action.eventId] = new Promise((resolve, reject) => {
                resolveFn = resolve;
                rejectFn = reject;
            }).then((data): void => {
                if (this._pendingInterceptByeventId[action.eventId]) {
                    delete this._pendingInterceptByeventId[action.eventId];
                    this._dispatch({ type: ActionType.resolved, threadId: this.id, eventId: action.eventId, payload: data });
                }
            }).catch((): void => {
                if (this._pendingInterceptByeventId[action.eventId]) {
                    delete this._pendingInterceptByeventId[action.eventId];
                    this._dispatch({ type: ActionType.rejected, threadId: this.id, eventId: action.eventId });
                }
            });
            return {resolve: resolveFn, reject: rejectFn, value: action.payload};
        }
        this._progressBThread(action.eventId, createInterceptPromise());
        return true; // was intercepted
    }

    public onDelete(): void {
        this._cancelPendingPromises();
        delete this._thread;
    }
}
