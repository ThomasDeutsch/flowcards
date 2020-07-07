import { Action, ActionType } from './action';
import { Reaction, ReactionType } from './reaction';
import { FCEvent } from './event';
import { BThreadKey } from './bthread';

interface LoggedAction extends Action {
    actionIndex: number;
    reactingBThreads: Set<string>;
    cancelledPromises: FCEvent[];
}

export interface BThreadInfo {
    id: string;
    enabledInStep: number;
    key?: BThreadKey;
    title?: string;
    reactions: Map<number, Reaction>;
}

export interface Log {
    actions: LoggedAction[];
    bThreadInfoById: Record<string, BThreadInfo>;
    latestAction: Action;
}

export class Logger {
    private _actions: LoggedAction[] = [];
    private _bThreadInfoById: Record<string, BThreadInfo> = {};

    public constructor() {}

    private _getActionIndex(): number {
        return this._actions.length-1;
    }

    public addThreadInfo(id: string, title?: string) {
        this._bThreadInfoById[id] = {id: id, title: title, reactions: new Map<number, Reaction>(), enabledInStep: this._getActionIndex()};
    }

    public logAction(action: Action): void {
        this._actions.push({...action, reactingBThreads: new Set(), actionIndex: this._getActionIndex(), cancelledPromises: []});
    }

    public logReaction(threadId: string, type: ReactionType, cancelledPromises?: FCEvent[]): void {
        const actionIndex = this._getActionIndex();
        this._actions[actionIndex].reactingBThreads.add(threadId);
        const reaction: Reaction = {
            type: type,
            actionIndex: actionIndex,
            cancelledPromises: cancelledPromises
        };
        if(cancelledPromises && cancelledPromises.length > 0) {
            this._actions[actionIndex].cancelledPromises = [...this._actions[actionIndex].cancelledPromises, ...cancelledPromises];
        }
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
