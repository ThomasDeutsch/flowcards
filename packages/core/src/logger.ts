import { Action } from './action';
import { Bid } from './bid';
import { BThreadId } from './bthread';
import { BThreadMap } from './bthread-map';
import * as utils from './utils';
import { BThreadState } from './bthread';
import { EventId, EventMap } from './event-map';

export enum BThreadReactionType {
    init = 'init',
    newPending = 'newPending',
    progress = 'progress',
    exception = 'exception'
}

export interface BThreadInitReaction {
    type: BThreadReactionType.init;
    actionId: number;
    nextState: BThreadState;
    hasNextSection: boolean;
}

export interface BThreadNewPendingReaction {
    type: BThreadReactionType.newPending;
    actionId: number;
    nextState: BThreadState;
    bid: Bid;
    hasNextSection: boolean;
}

export interface BThreadProgressReaction {
    type: BThreadReactionType.progress;
    actionId: number;
    nextState: BThreadState;
    bid: Bid;
    hasNextSection: boolean;
}

export interface BThreadExceptionReaction {
    type: BThreadReactionType.exception;
    actionId: number;
    nextState: BThreadState;
    eventId: EventId;
    hasNextSection: boolean;
}

export enum ScaffoldingResultType {
    init = 'init',
    reset = 'reset',
    enabled = 'enabled',
    disabled = 'disabled',
    destroyed = 'destroyed',
}

export type BThreadReaction = BThreadProgressReaction | BThreadExceptionReaction | BThreadInitReaction | BThreadNewPendingReaction;

export class Logger {
    private _actionId = 0;
    public set actionId(id: number) {
        this._actionId = id;
    }
    private _actions: Action[] = [];
    public get actions() { return this._actions; }
    public bThreadReactionHistory = new BThreadMap<Map<number, BThreadReaction>>();
    public bThreadScaffoldingHistory = new BThreadMap<Map<number, ScaffoldingResultType>>();
    public pendingHistory = new Map<number, EventMap<Bid[]>>();

    private _getHasNextSection(bThreadReactions: Map<number, BThreadReaction>, nextState: BThreadState): boolean {
        const latestReactionIndex = utils.latest([...bThreadReactions.keys()]);
        if(latestReactionIndex === undefined) return false;
        return nextState.section !== bThreadReactions.get(latestReactionIndex)?.nextState.section;
    }

    public logScaffoldingResult(type: ScaffoldingResultType, bThreadId: BThreadId): void {
        let bThreadHistory = this.bThreadScaffoldingHistory.get(bThreadId);
        if(bThreadHistory === undefined) {
            bThreadHistory = this.bThreadScaffoldingHistory.set(bThreadId, new Map()).get(bThreadId);
        }
        bThreadHistory!.set(this._actionId, type);
    }

    public logAction(action: Action): void {
        const a = {...action}
        if(action.resolve) {
            this._actions[action.resolve.requestLoopIndex].resolveActionId = action.id!;
        }
        if(action.resolveActionId === null) {
            a.payload = undefined; // do not save the promise object 
        }
        this._actions.push(a);
    }

    private _getBThreadReactions(bThreadId: BThreadId): Map<number, BThreadReaction> {
        let bThreadReactions = this.bThreadReactionHistory.get(bThreadId);
        if(bThreadReactions === undefined) {
            bThreadReactions = new Map<number, BThreadReaction>()
            this.bThreadReactionHistory.set(bThreadId, bThreadReactions);
        }
        return bThreadReactions;
    }

    public logBThreadInit( bThreadId: BThreadId, nextState: BThreadState) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)?.id || -1;
        bThreadReactions.set(currentLoopIndex, {
            type: BThreadReactionType.init,
            actionId: currentLoopIndex,
            nextState: {...nextState},
            hasNextSection: nextState.section !== undefined
        });
    }

    public logBThreadNewPending( bThreadId: BThreadId, bid: Bid, nextState: BThreadState) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)?.id || -1;
        bThreadReactions.set(currentLoopIndex, {
            type: BThreadReactionType.newPending,
            actionId: currentLoopIndex,
            nextState: {...nextState},
            bid: bid,
            hasNextSection: false
        });
    }

    public logBThreadProgress( bThreadId: BThreadId, bid: Bid, nextState: BThreadState) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)!.id!;
        const hasNextSection = this._getHasNextSection(bThreadReactions, nextState);
        bThreadReactions.set(currentLoopIndex, {
            type: BThreadReactionType.progress,
            actionId: currentLoopIndex,
            bid: bid,
            nextState: {...nextState},
            hasNextSection: hasNextSection
        });
    }

    public logBThreadException( bThreadId: BThreadId, eventId: EventId, nextState: BThreadState) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)!.id!;
        const hasNextSection = this._getHasNextSection(bThreadReactions, nextState);
        bThreadReactions.set(currentLoopIndex, {
            type: BThreadReactionType.exception,
            actionId: currentLoopIndex,
            eventId: eventId,
            nextState: {...nextState},
            hasNextSection: hasNextSection
        });
    }

    public logPending(pending?: EventMap<Bid[]>): void {
        if(!pending) return;
        this.pendingHistory.set(this._actionId, pending.clone());
    }

    public resetLog(): void {
        this._actionId = 0;
        this._actions = [];
        this.bThreadReactionHistory = new BThreadMap();
        this.bThreadScaffoldingHistory = new BThreadMap();
        this.pendingHistory = new Map();
    }
}
