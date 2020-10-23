import { Action } from './action';
import { Bid } from './bid';
import { BThreadId, PendingEventInfo } from './bthread';
import { BThreadMap } from './bthread-map';
import * as utils from './utils';
import { BThreadState } from './bthread';
import { EventId, EventMap } from './event-map';

export enum BThreadReactionType {
    init = 'init',
    progress = 'progress',
    reset = 'reset',
    exception = 'exception',
    destroy = 'destroy'
}

export interface BThreadInitReaction {
    type: BThreadReactionType.init;
    actionId: number;
    nextState: BThreadState;
    hasNextSection: boolean;
}

export interface BThreadResetReaction {
    type: BThreadReactionType.reset;
    actionId: number;
    nextState: BThreadState;
    changedPropNames: string[];
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

export interface BThreadDestroyReaction {
    type: BThreadReactionType.destroy;
    cancelledRequests: EventMap<PendingEventInfo>;
    nextState?: BThreadState;
}


export type BThreadReaction = BThreadInitReaction | BThreadResetReaction | BThreadProgressReaction | BThreadExceptionReaction | BThreadDestroyReaction;

export class ActionLog {
    private _actions: Action[] = [];
    public get actions() {
        return this._actions;
    }
    public enabledBThreadIds = new Map<number, string[]>();
    public bThreadReactionHistory = new Map<string, Map<number, BThreadReaction>>();

    private _getNextSection(bThreadReactions: Map<number, BThreadReaction>, nextState?: BThreadState) {
        const latestActionId = utils.latest([...bThreadReactions.keys()]);
        if(latestActionId && nextState) {
            const currentSection = bThreadReactions.get(latestActionId)?.nextState?.section;
            return currentSection !== nextState.section;
        }
        return nextState !== undefined ? true : false;
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

    public logEnabledBThreadIds(actionIndex: number, ids: string[]) {
        this.enabledBThreadIds.set(actionIndex, ids);
    }

    private _getBThreadReactions(bThreadId: BThreadId): Map<number, BThreadReaction> {
        const bThreadIdString = BThreadMap.toIdString(bThreadId);
        let bThreadReactions = this.bThreadReactionHistory.get(bThreadIdString);
        if(bThreadReactions === undefined) {
            bThreadReactions = new Map<number, BThreadReaction>()
            this.bThreadReactionHistory.set(bThreadIdString, bThreadReactions);
        }
        return bThreadReactions;
    }

    public logBThreadInit(bThreadId: BThreadId, initialState: BThreadState) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const latestAction = utils.latest(this._actions)
        const currentLoopIndex =  latestAction ? latestAction.id! : 0;
        bThreadReactions!.set(currentLoopIndex, {
            type: BThreadReactionType.init,
            actionId: currentLoopIndex,
            nextState: initialState,
            hasNextSection: this._getNextSection(bThreadReactions)
        });
    }

    public logBThreadProgress( bThreadId: BThreadId, bid: Bid, nextState: BThreadState) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)!.id!;
        bThreadReactions!.set(currentLoopIndex, {
            type: BThreadReactionType.progress,
            actionId: currentLoopIndex,
            bid: bid,
            nextState: nextState,
            hasNextSection: this._getNextSection(bThreadReactions, nextState)
        });
    }

    public logBThreadException( bThreadId: BThreadId, eventId: EventId, nextState: BThreadState) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)!.id!;
        bThreadReactions!.set(currentLoopIndex, {
            type: BThreadReactionType.exception,
            actionId: currentLoopIndex,
            eventId: eventId,
            nextState: nextState,
            hasNextSection: this._getNextSection(bThreadReactions, nextState)
        });
    }

    public logBThreadReset(bThreadId: BThreadId, changedPropNames: string[], nextState: BThreadState) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)!.id!;
        bThreadReactions!.set(currentLoopIndex, {
            type: BThreadReactionType.reset,
            actionId: currentLoopIndex,
            nextState: nextState,
            changedPropNames: changedPropNames,
            hasNextSection: this._getNextSection(bThreadReactions, nextState)
        });
    }

    public logBThreadDestroy(bThreadId: BThreadId, cancelledRequests: EventMap<PendingEventInfo>) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)!.id!;
        bThreadReactions!.set(currentLoopIndex, {
            type: BThreadReactionType.destroy,
            cancelledRequests: cancelledRequests,
            nextState: undefined
        });
    }

    public resetLog(): void {
        this._actions = [];
        this.enabledBThreadIds = new Map<number, string[]>();
        this.bThreadReactionHistory = new Map<string, Map<number, BThreadReaction>>();
    }
}
