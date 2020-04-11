/* eslint-disable @typescript-eslint/no-explicit-any */

import { BidDictionaries, getBidDictionaries, BidType, BidDictionaryType } from './bid';
import * as utils from "./utils";
import { Logger } from "./logger";
import { ActionType, Action } from './action';
import { ReactionType } from './reaction';
import { DispatchFunction } from './update-loop';

export type ThreadGen = any; // TODO: Type this generator
export interface BThreadDictionary {
    [Key: string]: BThread;
}

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

type StateUpdateFunction = (previousState: any) => void;

export class BThread {
    public readonly id: string;
    public readonly key: string | number | null = null;
    private readonly _logger?: Logger;
    private readonly _dispatch: DispatchFunction;
    private readonly _generator: ThreadGen;
    private _currentArguments: any[];
    private _thread: IterableIterator<any>;
    private _currentBids: BidDictionaries | null = null;
    private _currentBidsIsFunction: boolean = false;
    private _nextBid: any;
    private _pendingPromiseRecord: Record<string, Promise<any>> = {};
    private _pendingIntercepts: Set<string> = new Set();
    private _isCompleted: boolean = false;
    private _stateValue?: any;
    private _stateRef: BThreadState = { isCompleted: this._isCompleted, pendingEvents: this._pendingIntercepts };
    public get state(): BThreadState {
        this._stateRef.isCompleted = this._isCompleted;
        this._stateRef.pendingEvents = new Set([...Object.keys(this._pendingPromiseRecord), ...this._pendingIntercepts]);
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

    public constructor(id: string, generator: ThreadGen, args: any[], dispatch: DispatchFunction, key?: string | number, logger?: Logger) {
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

    private _renewCurrentBids(): void {
        this._currentBidsIsFunction = false;
        this._currentBids = null;
        if(typeof this._nextBid === 'function') {
            this._currentBidsIsFunction = true;
            return;
        }
        this._currentBids = getBidDictionaries(this.id, this._nextBid, this.state.pendingEvents);
    }

    private _cancelPendingPromises(): string[] {
        const cancelledPromises: string[] = [];
        const eventNames = Object.keys(this._pendingPromiseRecord);
        if (eventNames.length > 0) {   
            eventNames.forEach((eventName):void => {
                delete this._pendingPromiseRecord[eventName];
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
        this._renewCurrentBids();
        return cancelledPromises;
    }

    private _progressThread(eventName: string, payload: any, isReject: boolean): void {
        let returnVal = null;
        if(!isReject) {
            returnVal = (this._currentBids && (this._currentBids.type === BidDictionaryType.array)) ? [eventName, payload] : payload;
        }
        const cancelledPromises = this._processNextBid(returnVal);
        if (this._logger) this._logger.logReaction(this.id, ReactionType.progress, cancelledPromises);
    }

    // --- public

    public getBids(): BidDictionaries | null {
        if(this._currentBidsIsFunction) {
            return getBidDictionaries(this.id, this._nextBid(), this.state.pendingEvents);
        } 
        return this._currentBids;
    }

    public resetOnArgsChange(nextArguments: any): void {
        if (utils.areInputsEqual(this._currentArguments, nextArguments)) {
            return;
        }
        this._currentArguments = nextArguments;
        this._thread = this._generator(...this._currentArguments);
        const cancelledPromises = this._processNextBid();
        if (this._logger) this._logger.logReaction(this.id, ReactionType.reset, cancelledPromises);
    }

    public addPromise(eventName: string, promise: Promise<any>): void {
        this._pendingPromiseRecord[eventName] = promise;
        this._renewCurrentBids();
        this._pendingPromiseRecord[eventName]
            .then((data): void => {
                if (this._pendingPromiseRecord[eventName] && Object.is(promise, this._pendingPromiseRecord[eventName])) {
                    delete this._pendingPromiseRecord[eventName];
                    this._dispatch({ type: ActionType.resolved, threadId: this.id, eventName: eventName, payload: data });
                }
            })
            .catch((e): void => {
                if (this._pendingPromiseRecord[eventName] && Object.is(promise, this._pendingPromiseRecord[eventName])) {
                    delete this._pendingPromiseRecord[eventName];
                    this._dispatch({ type: ActionType.rejected, threadId: this.id, eventName: eventName, payload: e });
                }
            });
        if (this._logger) this._logger.logReaction(this.id, ReactionType.promise, null);
    }

    public rejectPromise(eventName: string, payload: any, doThrow: boolean): void {
        if(!doThrow) {
            delete this._pendingPromiseRecord[eventName];
            this._renewCurrentBids();
            return;
        }
        if(this._thread && this._thread.throw) { 
            this._thread.throw({eventName: eventName, error: payload});
            this._progressThread(eventName, payload, true);
        }
    }
    
    public progressRequest(action: Action): void {
        const bidType = BidType.request;
        if (!this._currentBids || !this._currentBids[bidType] || !this._currentBids[bidType][action.eventName]) {
            console.error(`thread '${this.id}' had no current bids for action '${bidType}:${action.eventName}')`);
            return;
        }
        this._progressThread(action.eventName, action.payload, false);
    }

    public progressWait(action: Action): void {
        const bidType = BidType.wait;
        if (!this._currentBids || !this._currentBids[bidType] || !this._currentBids[bidType][action.eventName]) {
            console.error(`thread '${this.id}' had no current bids for action '${bidType}:${action.eventName}')`);
            return;
        }
        const guard = this._currentBids[bidType][action.eventName].guard;
        if(guard && !guard(action.payload)) return;
        this._progressThread(action.eventName, action.payload, false);
    }

    public progressIntercept(action: Action): boolean {
        const bidType = BidType.intercept;
        if (!this._currentBids || !this._currentBids[bidType] || !this._currentBids[bidType][action.eventName]) {
            console.error(`thread '${this.id}' had no current bids for action '${bidType}:${action.eventName}')`);
            return false;
        }
        const guard = this._currentBids[bidType][action.eventName].guard;
        if(guard && !guard(action.payload)) return false;
        this._pendingIntercepts.add(action.eventName);
        this._progressThread(action.eventName, action.payload, false);
        return true; // was intercepted
    }

    public onDelete(): void {
        this._cancelPendingPromises();
        delete this._thread;
    }
}
