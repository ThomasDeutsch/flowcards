/* eslint-disable @typescript-eslint/no-explicit-any */

import { BidDictionaries, getBidDictionaries, BidType, BidDictionaryType } from './bid';
import * as utils from "./utils";
import { Logger, ReactionType } from "./logger";
import { ActionType } from './action';
import { DispatchFunction } from './update-loop';
import { DispatchByWait } from './dispatch-by-wait';

export type ThreadGen = any; // TODO: Type this generator
export interface ThreadDictionary {
    [Key: string]: BThread;
}

export interface ThreadState {
    isCompleted: boolean;
    nrProgressions: number;
    pendingEvents?: Set<string>;
    value?: any;
}

type ComponentName = string;
type PropsStyleComponent = "style" | "props" | "component";
type OverrideFn = (dispatchByWait: DispatchByWait, pendingEvents: Set<string>) => Record<ComponentName, Record<PropsStyleComponent, any> | any>;
type setOverrideFn = (overrideFn: OverrideFn) => void;
type HideFn = (defaultComponentName: string) => void;

export interface BTContext {
    key: string | number | null;
    override: setOverrideFn;
    hide: HideFn;
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
    private readonly _dispatch: DispatchFunction;
    private readonly _generator: ThreadGen;
    private _currentArguments: any[];
    private _thread: IterableIterator<any>;
    private _currentBids: BidDictionaries | null = null;
    private _nextBid: any;
    private _pendingPromiseDict: Record<string, Promise<any>> = {};
    private _pendingEvents: Set<string> = new Set([]);
    public get pendingEvents(): Set<string> {
        return this._pendingEvents;
    }
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
        this._stateRef.pendingEvents = this._pendingEvents;
        this._stateRef.value = this._stateValue;
        return this._stateRef;
    }
    private _overrides: OverrideFn[] = [];
    public get overrides(): OverrideFn[] {
        return this._overrides;
    }

    private _getBTContext(): BTContext {
        return {
            key: this.key,
            override: (overrideFn: OverrideFn): void => {
                this._overrides.push(overrideFn);
            },
            hide: (defaultComponentName: string): void => {
                this._overrides.push((): any => ({[defaultComponentName]: (): any => null}));
            },
            setState: (val: any): void => {
                this._stateValue = val;
            },
            state: ():any => this._stateValue
        };
    }

    public constructor(generator: ThreadGen, args: any[], dispatch: DispatchFunction, key?: string | number, logger?: Logger) {
        this.id = scenarioId(generator, key);
        if (key || key === 0) {
            this.key = key;
        }
        this._dispatch = dispatch;
        this._generator = generator.bind(this._getBTContext());
        this._logger = logger;
        this._currentArguments = args;
        this._thread = this._generator(...this._currentArguments);
        this._processNextBid();
        if (this._logger) this._logger.logReaction(this.id, ReactionType.init);
    }

    private _increaseProgress(): void {
        this._nrProgressions = this._nrProgressions + 1;
        this._currentBids = null;
    }

    private _cancelPendingPromises(): Set<string> {
        const cancelledPromises = new Set<string>();
        const eventNames = Object.keys(this._pendingPromiseDict);
        this._pendingEvents = new Set<string>();
        if (eventNames.length > 0) {   
            eventNames.forEach((eventName):void => {
                delete this._pendingPromiseDict[eventName];
                cancelledPromises.add(eventName);
            });
        }
        return cancelledPromises;
    }

    private _processNextBid(returnValue?: any): Set<string> {
        this._isCompleted = false; // thread could have been reset
        const cancelledPromises = this._cancelPendingPromises();
        this._overrides = [];
        const next = this._thread.next(returnValue);
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
        this._pendingEvents.add(eventName);
        this._increaseProgress();
        this._pendingPromiseDict[eventName]
            .then((data): void => {
                if (this._pendingPromiseDict[eventName] && Object.is(promise, this._pendingPromiseDict[eventName])) {
                    delete this._pendingPromiseDict[eventName];
                    this._pendingEvents.delete(eventName);
                    this._dispatch({ type: ActionType.resolve, threadId: this.id, eventName: eventName, payload: data });
                }
            })
            .catch((e): void => {
                if (this._pendingPromiseDict[eventName] && Object.is(promise, this._pendingPromiseDict[eventName])) {
                    delete this._pendingPromiseDict[eventName];
                    this._pendingEvents.delete(eventName);
                    this._dispatch({ type: ActionType.reject, threadId: this.id, eventName: eventName, payload: e });
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
        }
        else if(typeof this._nextBid === 'function') {
            this._currentBids = getBidDictionaries(this.id, this._nextBid(), this._pendingEvents);
        } 
        else if(this._currentBids === null) {
            this._currentBids = getBidDictionaries(this.id, this._nextBid, this._pendingEvents);
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

    public addPromise(eventName: string, promise: Promise<any> | null): void {
        if(promise === null) {
            this._pendingEvents.add(eventName);
            this._increaseProgress();
        } else {
            this._addPromise(eventName, promise);
        }
        if (this._logger) this._logger.logReaction(this.id, ReactionType.promise, null, this._pendingEvents);
    }

    public advanceRequest(eventName: string, payload: any): void {
        this._progressThread(eventName, payload, false);
    }

    public rejectPromise(eventName: string, payload: any, doThrow: boolean): void {
        if(!doThrow) {
            this._pendingEvents.delete(eventName);
            this._increaseProgress();
            return;
        }
        if(this._thread && this._thread.throw) { 
            this._thread.throw({eventName: eventName, error: payload});
            this._progressThread(eventName, payload, true);
        }
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
