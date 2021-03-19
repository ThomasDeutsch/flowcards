import { Bid } from './bid';
import { BThreadMap } from './bthread-map';
import * as utils from './utils';
import { BThreadId, BThreadState } from './bthread';
import { EventId, EventMap } from './event-map';
import { ActionWithId } from '.';
import { ActionCheck } from './action-check';

export enum BThreadReactionType {
    init = 'init',
    progress = 'progress',
    error = 'error',
    newPending = 'newPending'
}

export interface BThreadInitReaction {
    type: BThreadReactionType.init;
    actionId: number;
    nextState: BThreadState;
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
    type: BThreadReactionType.error;
    actionId: number;
    nextState: BThreadState;
    eventId: EventId;
    hasNextSection: boolean;
}

export interface BThreadNewPendingReaction {
    type: BThreadReactionType.newPending;
    actionId: number;
    nextState: BThreadState;
    bid: Bid;
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
    private _actions: ActionWithId[] = [];
    public get actions(): ActionWithId[] { return this._actions; }
    public bThreadReactionHistory = new BThreadMap<Map<number, BThreadReaction>>();
    public bThreadScaffoldingHistory = new BThreadMap<Map<number, ScaffoldingResultType>>();

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

    public logAction(action: ActionWithId): void {
        const a = {...action}
        if(action.resolve) {
            this._actions[action.resolve.requestActionId].resolveActionId = action.id;
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

    public logBThreadProgress( bThreadId: BThreadId, bid: Bid, nextState: BThreadState): void {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)!.id || 0;
        const hasNextSection = this._getHasNextSection(bThreadReactions, nextState);
        bThreadReactions.set(currentLoopIndex, {
            type: BThreadReactionType.progress,
            actionId: currentLoopIndex,
            bid: bid,
            nextState: {...nextState},
            hasNextSection: hasNextSection
        });
    }

    public logBThreadNewPending( bThreadId: BThreadId, bid: Bid, nextState: BThreadState): void {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)!.id || 0;
        const hasNextSection = this._getHasNextSection(bThreadReactions, nextState);
        bThreadReactions.set(currentLoopIndex, {
            type: BThreadReactionType.newPending,
            actionId: currentLoopIndex,
            bid: bid,
            nextState: {...nextState},
            hasNextSection: hasNextSection
        });
    }

    public logBThreadException( bThreadId: BThreadId, eventId: EventId, nextState: BThreadState): void {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)!.id || 0;
        const hasNextSection = this._getHasNextSection(bThreadReactions, nextState);
        bThreadReactions.set(currentLoopIndex, {
            type: BThreadReactionType.error,
            actionId: currentLoopIndex,
            eventId: eventId,
            nextState: {...nextState},
            hasNextSection: hasNextSection
        });
    }

    public resetLog(): void {
        this._actionId = 0;
        this._actions = [];
        this.bThreadReactionHistory = new BThreadMap();
        this.bThreadScaffoldingHistory = new BThreadMap();
    }
}
