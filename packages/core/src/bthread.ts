import { BidDictionaries, getBidDictionaries, getCurrentBids, BidType, BidDictionaryType } from "./bid";
import * as utils from "./utils";
import { Logger, ReactionType } from "./logger";
import { ActionType, ExternalActions } from './action';

export type ThreadGen = any; // TODO: Type this generator
export interface ThreadDictionary {
    [Key: string]: BThread;
}

interface PromiseDictionary<T> {
    [Key: string]: Promise<T>;
}

type DispatchFn = Function;

export interface ThreadState {
    isCompleted: boolean;
    nrProgressions: number;
    pendingEvents?: Array<string>;
    value: any;
}

export function scenarioId(generator: ThreadGen, key?: string | number): string {
    const id = generator.name;
    return key || key === 0 ? `${id}_${key.toString()}` : id;
}

export class BThread {
    readonly id: string;
    readonly key?: String;
    private readonly _logger?: Logger;
    private readonly _dispatch: DispatchFn;
    private readonly _generator: ThreadGen;
    private _currentArguments: Array<any>;
    private _thread: IterableIterator<any>;
    private _currentBids: BidDictionaries | null = null;
    private _nextBid: any;
    private _pendingPromiseDict: PromiseDictionary<any> = {};
    get pendingEventNames() {
        return Object.keys(this._pendingPromiseDict);
    }
    private _isCompleted: boolean = false;
    private _nrProgressions: number = -1;
    get nrProgressions() {
        return this._nrProgressions;
    }
    private _stateValue: any;
    private _stateRef: any = {};
    get state(): ThreadState {
        this._stateRef.isCompleted = this._isCompleted;
        this._stateRef.nrProgressions = this._nrProgressions;
        this._stateRef.pendingEvents = Object.keys(this._pendingPromiseDict);
        this._stateRef.value = this._stateValue;
        return this._stateRef;
    }
    private _override: Function | null;
    get override(): Function | null {
        return this._override;
    }
    private _getThreadContext() {
        return {
            key: this.key,
            show: (overrideFn: Function): void => {
                this._override = overrideFn;
            },
            setState: (val: any): void => {
                this._stateValue = val;
            },
            state: () => this._stateValue
        };
    }

    constructor(generator: ThreadGen, args: Array<any>, dispatch: Function, key?: string | number, logger?: Logger) {
        this.id = scenarioId(generator, key);
        if (key || key === 0) {
            this.key = key.toString();
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

    // --- private

    private _setNewBids(): void {
        if(this._nextBid === null) {
            this._currentBids = null;
            return;
        }
        let bids;
        if(typeof this._nextBid === 'function') {
            bids = getBidDictionaries(this.id, this._nextBid());
        } else {
            bids = getBidDictionaries(this.id, this._nextBid);
        }
        this._currentBids = getCurrentBids(bids, this.pendingEventNames);
    }

    private _increaseProgress(): void {
        this._nrProgressions = this._nrProgressions + 1;
        this._setNewBids();
    }

    private _cancelPendingPromises(): string[] {
        let cancelledPromises: string[] = [];
        let eventNames = Object.keys(this._pendingPromiseDict);
        if (eventNames.length > 0) {
            eventNames.forEach(eventName => {
                delete this._pendingPromiseDict[eventName];
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
        this._increaseProgress();
        this._pendingPromiseDict[eventName]
            .then(data => {
                if (this._pendingPromiseDict[eventName] && utils.is(promise, this._pendingPromiseDict[eventName])) {
                    delete this._pendingPromiseDict[eventName];
                    this._dispatch({
                        actions: [{ type: ActionType.resolve, threadId: this.id, eventName: eventName, payload: data }]
                    } as ExternalActions);
                }
            })
            .catch(e => {
                if (this._pendingPromiseDict[eventName] && utils.is(promise, this._pendingPromiseDict[eventName])) {
                    delete this._pendingPromiseDict[eventName];
                    this._dispatch({
                        actions: [{ type: ActionType.reject, threadId: this.id, eventName: eventName, payload: e }]
                    } as ExternalActions);
                }
            });
    }

    private _progressThread(eventName: string, payload: any, isReject: boolean): void {
        let returnVal = null
        if(!isReject) {
            returnVal = (this._currentBids!.type === BidDictionaryType.array) ? [payload, eventName] : payload;
        }
        const cancelledPromises = this._processNextBid(returnVal);
        if (this._logger) this._logger.logReaction(this.id, ReactionType.progress, cancelledPromises);
    }

    // --- public

    public getBids(): BidDictionaries | null {
        if(typeof this._nextBid === 'function') {
            this._setNewBids();  
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

    public progressRequestResolve(type: ActionType, eventName: string, payload: any): [any, boolean] {
        if (payload !== null && payload !== undefined) {
            if (utils.isThenable(payload)) {
                this._addPromise(eventName, payload);
                if (this._logger) this._logger.logReaction(this.id, ReactionType.promise);
                return [payload, true];
            }
        }
        if(type === ActionType.reject) {
            this._thread!.throw!({eventName: eventName, error: payload});
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
