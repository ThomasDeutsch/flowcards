import { Action, ActionType } from './action';
import { BThreadKey } from './bthread';
import { Bid, BThreadBids } from './bid';
import { FCEvent } from './event';

export interface LoggedAction extends Action {
    actionIndex: number;
    reactingBThreads: Set<string>;
}

export interface BThreadInfo {
    id: string;
    enabledInStep: number;
    key?: BThreadKey;
    title?: string;
    reactions: Map<number, BThreadReaction>;
}

export interface Log {
    actions: LoggedAction[];
    bThreadInfoById: Record<string, BThreadInfo>;
    latestAction: Action;
}

export enum BThreadReactionType {
    progress = "progress",
    reset = "reset",
    promise = "promise",
    extend = "extend"
}

export interface BThreadReaction {
    type: BThreadReactionType;
    actionIndex: number;
    cancelledPromises?: FCEvent[];
    changedProps?: string[];
    threadSection?: string;
    bid?: Bid;
}

export class Logger {
    private _actions: LoggedAction[] = [];
    private _bThreadInfoById: Record<string, BThreadInfo> = {};

    private _getActionIndex(): number {
        return this._actions.length-1;
    }

    public addThreadInfo(id: string, title?: string) {
        this._bThreadInfoById[id] = {id: id, title: title, reactions: new Map<number, BThreadReaction>(), enabledInStep: this._getActionIndex()};
    }

    public logAction(action: Action): void {
        this._actions.push({...action, reactingBThreads: new Set(), actionIndex: this._getActionIndex()+1});
    }

    public logPromise(bid: Bid): void {
        const actionIndex = this._getActionIndex();
        const reaction = {
            type: BThreadReactionType.promise,
            actionIndex: actionIndex,
            bid: bid
        }
        this._bThreadInfoById[bid.threadId].reactions.set(actionIndex, reaction);
    }

    public logExtend(bid: Bid): void {
        const actionIndex = this._getActionIndex();
        const reaction = {
            type: BThreadReactionType.extend,
            actionIndex: actionIndex,
            bid: bid
        }
        this._bThreadInfoById[bid.threadId].reactions.set(actionIndex, reaction);
    }

    public logThreadProgression(bid: Bid, threadSection: string | undefined, cancelledPromises?: FCEvent[]): void {
        const actionIndex = this._getActionIndex();
        this._actions[actionIndex].reactingBThreads.add(bid.threadId);
        const reaction: BThreadReaction = {
            type: BThreadReactionType.progress,
            actionIndex: actionIndex,
            cancelledPromises: cancelledPromises,
            threadSection: threadSection,
            bid: bid
        };
        this._bThreadInfoById[bid.threadId].reactions.set(actionIndex, reaction);
    }

    public logThreadReset(threadId: string, changedProps: string[], cancelledPromises?: FCEvent[], ) {
        const actionIndex = this._getActionIndex();
        this._actions[actionIndex].reactingBThreads.add(threadId);
        const reaction: BThreadReaction = {
            type: BThreadReactionType.reset,
            actionIndex: actionIndex,
            changedProps: changedProps,
            cancelledPromises: cancelledPromises
        };
        this._bThreadInfoById[threadId].reactions.set(actionIndex, reaction);
    }

    public getLog(): Log {
        return {
            actions: this._actions,
            latestAction: this._actions[this._actions.length-1],
            bThreadInfoById: this._bThreadInfoById
        };
    }

    public resetLog(): void {
        this._actions = [];
        this._bThreadInfoById = {};  
    }
}
