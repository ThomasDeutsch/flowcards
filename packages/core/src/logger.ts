import { Action, ActionType } from './action';
import { Reaction, ReactionType } from './reaction';
import { EventMap, FCEvent } from './event';
import { BThreadKey } from './bthread';

interface LoggedAction extends Action {
    stepNr: number;
    pendingDuration?: number;
    reactingBThreads: Record<string, string>;
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
    private _pendingDurationByEvent: EventMap<number> = new EventMap();

    public constructor() {}

    private _getStepNr(): number {
        return this._actions.length > 0 ? this._actions[this._actions.length-1].stepNr + 1 : 0;
    }

    public addThreadInfo(id: string, title?: string) {
        this._bThreadInfoById[id] = {id: id, title: title, reactions: new Map<number, Reaction>(), enabledInStep: this._getStepNr()};
    }

    public logAction(action: Action): void {
        this._actions.push({...action, reactingBThreads: {}, stepNr: this._getStepNr()});
    }

    public logReaction(threadId: string, type: ReactionType, cancelledPromises?: FCEvent[] | null, event?: FCEvent): void {
        const stepNr = this._getStepNr();
        const reaction: Reaction = {
            type: type,
            stepNr: stepNr,
            cancelledPromises: cancelledPromises ? cancelledPromises : undefined
        };
        if(type === ReactionType.promise && event) {
            this._pendingDurationByEvent.set(event, new Date().getTime());
        }
        else if(event && (type === ReactionType.resolve || type === ReactionType.reject)) {
            const resolveTime = new Date().getTime();
            const duration = resolveTime - (this._pendingDurationByEvent.get(event) || resolveTime);
            this._pendingDurationByEvent.delete(event);
            this._actions[this._actions.length-1].pendingDuration = duration;
        }
        if(type !== ReactionType.promise) {
            this._bThreadInfoById[threadId].reactions.set(stepNr, reaction);
        }
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
        this._pendingDurationByEvent = new EventMap();   
    }
}
