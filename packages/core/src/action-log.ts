import { Action, ActionType } from './action';
import { Bid } from './bid';
import { BThreadId } from './bthread';
import { BThreadMap } from './bthread-map';
import * as utils from './utils';
import { BThreadState } from './bthread';

export enum BThreadReactionType {
    progress = 'progress',
    reset = 'reset',
    init = 'init'
}

export interface BThreadInitReaction {
    type: BThreadReactionType.init;
    actionId: number;
    nextState: BThreadState;
    nextSection?: string;
}

export interface BThreadResetReaction {
    type: BThreadReactionType.reset;
    actionId: number;
    nextState: BThreadState;
    nextSection?: string;
    changedPropNames: string[];
}

export interface BThreadProgressReaction {
    type: BThreadReactionType.progress;
    actionId: number;
    nextState: BThreadState;
    nextSection?: string;
    selectedBid: Bid;
}

export type BThreadReaction = BThreadInitReaction | BThreadResetReaction | BThreadProgressReaction;


export class ActionLog {
    private _actions: Action[] = [];
    public get actions() {
        return this._actions;
    }
    public enabledBThreadIds = new Map<number, string[]>();
    public bThreadReactionHistory = new Map<string, Map<number, BThreadReaction>>();

    public logAction(action: Action): void {
        const a = {...action}
        if(action.resolve) {
            this._actions[action.resolve.requestLoopIndex].resolveLoopIndex = action.id!;
        }
        if(action.resolveLoopIndex === null) {
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

    public logBThreadInit(bThreadId: BThreadId, initialState: BThreadState, initialSection?: string) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const latestAction = utils.latest(this._actions)
        const currentLoopIndex =  latestAction ? latestAction.id! : 0;
        bThreadReactions!.set(currentLoopIndex, {
            type: BThreadReactionType.init,
            actionId: currentLoopIndex,
            nextState: initialState,
            nextSection: initialSection
        });
    }

    public logBThreadProgress( bThreadId: BThreadId, bid: Bid, nextState: BThreadState, nextSection?: string) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)!.id!;
        bThreadReactions!.set(currentLoopIndex, {
            type: BThreadReactionType.progress,
            actionId: currentLoopIndex,
            selectedBid: bid,
            nextState: nextState,
            nextSection: nextSection
        });
    }

    public logBThreadReset(bThreadId: BThreadId, changedPropNames: string[], nextState: BThreadState, nextSection?: string) {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentLoopIndex = utils.latest(this._actions)!.id!;
        bThreadReactions!.set(currentLoopIndex, {
            type: BThreadReactionType.reset,
            actionId: currentLoopIndex,
            nextState: nextState,
            nextSection: nextSection,
            changedPropNames: changedPropNames,
        });
    }

    public resetLog(): void {
        this._actions = [];
        this.enabledBThreadIds = new Map<number, string[]>();
        this.bThreadReactionHistory = new Map<string, Map<number, BThreadReaction>>();
    }
}
