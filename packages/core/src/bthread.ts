/* eslint-disable @typescript-eslint/no-explicit-any */

import { BidDictionaries, getBidDictionaries, BidType, BidDictionaryType } from './bid';
import * as utils from "./utils";
import { Logger, ReactionType } from "./logger";
import { ActionType } from './action';

export type ThreadGen = any; // TODO: Type this generator
export interface ThreadDictionary {
    [Key: string]: BThread;
}

type DispatchFn = Function;

export interface ThreadState {
    isCompleted: boolean;
    nrProgressions: number;
    pendingEvents?: Set<string>;
    value?: any;
}

export interface ThreadContext {
    key: string | number | null;
    show: Function;
    setState: Function;
    state: Function;
}

export function scenarioId(generator: ThreadGen, key?: string | number): string {
    const id = generator.name;
    return key || key === 0 ? `${id}_${key.toString()}` : id;
}

export class BThread {
    public readonly id: string;
    public readonly key: string | number | null = null;
    private readonly _logger?: Logger;
    private readonly _dispatch: DispatchFn;
    private readonly _generator: ThreadGen;
    private _currentArguments: any[];
    private _thread: IterableIterator<any>;
    private _currentBids: BidDictionaries | null = null;
    private _nextBid: any;
    private _pendingPromiseDict: Record<string, Promise<any>> = {};
    public pendingEvents: Set<string> = new Set([]);
    private _isCompleted: boolean = false;
    private _nrProgressions: number = -1;
    public get nrProgressions(): number {
        return this._nrProgressions;
    }
    private _stateValue?: any;
    private _stateRef: ThreadState = { isCompleted: this._isCompleted, nrProgressions: this._nrProgressions };
    public get state(): ThreadState {
        this._stateRef.isCompleted = this._isCompleted;
        this._stateRef.nrProgressions = this._nrProgressions;
        this._stateRef.pendingEvents = this.pendingEvents;
        this._stateRef.value = this._stateValue;
        return this._stateRef;
    }
    private _override: Function | null;
    public get override(): Function | null {
        return this._override;
    }

    private _getThreadContext(): ThreadContext {
        return {
            key: this.key,
            show: (overrideFn: Function): void => {
                this._override = overrideFn;
            },
            setState: (val: any): void => {
                this._stateValue = val;
            },
            state: ():any => this._stateValue
        };
    }

    public constructor(generator: ThreadGen, args: any[], dispatch: Function, key?: string | number, logger?: Logger) {
        this.id = scenarioId(generator, key);
        if (key || key === 0) {
            this.key = key;
        }
        this._override = null;
        this._dispatch = dispatch;
        this._generator = generator.bind(this._getThreadContext());
        this._currentArguments = args;
        this._logger = logger;
        this._thread = this._generator(...this._currentArguments);
        this._processNextBid();
        if (this._logger) this._logger.logReaction(this.id, ReactionType.init);
    }

    private _increaseProgress(): void {
        this._nrProgressions = this._nrProgressions + 1;
    }

    private _cancelPendingPromises(): string[] {
        const cancelledPromises: string[] = [];
        const eventNames = Object.keys(this._pendingPromiseDict);
        if (eventNames.length > 0) {
            eventNames.forEach((eventName):void => {
                delete this._pendingPromiseDict[eventName];
                this.pendingEvents.delete(eventName);
                cancelledPromises.push(eventName);
            });
        }
        return cancelledPromises;
    }

    private _processNextBid(returnValue?: any): string[] {
        const cancelledPromises = this._cancelPendingPromises();
        this._override = null;
        const next: any = this._thread.next(returnValue);
        if (next.done) {
            this._isCompleted = true;
            this._nextBid = null;
        } else {
            this._nextBid = next.value;
        }
        this._increaseProgress();
        return cancelledPromises;
    }

    private _addPromise(eventName: string, promise: Promise<any>): void {
        this._pendingPromiseDict[eventName] = promise;
        this.pendingEvents.add(eventName);
        this._increaseProgress();
        this._pendingPromiseDict[eventName]
            .then((data): void => {
                if (this._pendingPromiseDict[eventName] && utils.is(promise, this._pendingPromiseDict[eventName])) {
                    delete this._pendingPromiseDict[eventName];
                    this.pendingEvents.delete(eventName);
                    this._dispatch({
                        actions: [{ type: ActionType.resolve, threadId: this.id, eventName: eventName, payload: data }]
                    });
                }
            })
            .catch((e): void => {
                if (this._pendingPromiseDict[eventName] && utils.is(promise, this._pendingPromiseDict[eventName])) {
                    delete this._pendingPromiseDict[eventName];
                    this.pendingEvents.delete(eventName);
                    this._dispatch({
                        actions: [{ type: ActionType.reject, threadId: this.id, eventName: eventName, payload: e }]
                    });
                }
            });
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
        if(this._nextBid === null || this._isCompleted) {
            this._currentBids = null;
            return null;
        }
        let bids;
        if(typeof this._nextBid === 'function') {
            bids = getBidDictionaries(this.id, this._nextBid(), this.pendingEvents);
        } else {
            bids = getBidDictionaries(this.id, this._nextBid, this.pendingEvents);
        }
        this._currentBids = bids;
        return bids;
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

    public progressRequestResolve(type: ActionType, eventName: string, payload: any): [any, boolean] {
        if (payload !== null && payload !== undefined) {
            if (utils.isThenable(payload)) {
                this._addPromise(eventName, payload);
                if (this._logger) this._logger.logReaction(this.id, ReactionType.promise);
                return [payload, true];
            }
        }
        if(type === ActionType.reject) {
            if(this._thread && this._thread.throw) { 
                this._thread.throw({eventName: eventName, error: payload});
            }
            this._progressThread(eventName, payload, true);
        } else {
            this._progressThread(eventName, payload, false);
        }
        return [payload, false];
    }

    public progressWaitIntercept(type: BidType, eventName: string, payload: any): boolean {
        if (!this._currentBids || !this._currentBids[type] || !this._currentBids[type][eventName]) {
            console.error(`thread '${this.id}' had no current bids for action '${type}:${eventName}')`);
            return false;
        }
        const guard = this._currentBids[type][eventName].guard;
        if(guard && !guard(payload)) {
            return false;
        }
        this._progressThread(eventName, payload, false);
        return true;
    }

    public onDelete(): void {
        if (this._logger) this._logger.logReaction(this.id, ReactionType.delete);
    }
}
