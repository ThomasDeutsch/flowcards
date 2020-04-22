import { Action, ActionType } from './action';
import { Reaction, ReactionType } from './reaction';
import { Bid } from './bid';

export interface ActionAndReactions {
    action: Action;
    reactionByThreadId: Record<string, Reaction>;
}
export type ThreadsByWait = Record<string, string[]>;


export interface Log {
    currentWaits: Record<eventId, Bid[]>;
    currentPendingEvents: Set<string>;
    latestAction: Action;
    latestReactionByThreadId: Record<string, Reaction>;
    actionsAndReactions: ActionAndReactions[];
    threadsByWait: ThreadsByWait;
}

function newActionsReactions(action?: Action): ActionAndReactions {
    return {
        action: action ? {...action} : { event: "", type: ActionType.initial, threadId: "" },
        reactionByThreadId: {}
    }
}

function toThreadsByWait(wbt: Record<string, Bid[]>): ThreadsByWait {
    return Object.keys(wbt).reduce((tbw: ThreadsByWait, eventId: string): ThreadsByWait => {
        wbt[eventId].map((bid): string => bid.threadId).forEach((threadId): void => {
            if(!tbw[eventId]) tbw[eventId] = [threadId];
            else tbw[eventId].push(threadId);
        });
        return tbw;
    }, {});
}

export class Logger {
    private _log: ActionAndReactions[] = [];
    private _latestActionAndReactions: ActionAndReactions;
    private _waitsByeventId: Record<string, Bid[]> = {};
    private _waits: Record<eventId, Bid[]> = {};
    private _pendingEvents: Set<string> = new Set();

    public constructor() {
        this._latestActionAndReactions = newActionsReactions();
    }

    public logWaits(waits: Record<eventId, Bid[]>): void {
        this._waits = waits;
    }

    public logPendingEvents(pendingEvents: Set<string>): void {
        this._pendingEvents = pendingEvents;
    }

    public logAction(action: Action): void {
        this._log.push(this._latestActionAndReactions);
        this._latestActionAndReactions = newActionsReactions(action);
    }

    public logReaction(threadId: string, type: ReactionType, cancelledPromises: Event[] | null = null): void {
        const reaction: Reaction = {
            type: type,
            threadId: threadId,
            cancelledPromises: cancelledPromises,
            pendingEvents: null
        };
        this._latestActionAndReactions.reactionByThreadId[reaction.threadId] = reaction;
    }

    public getLog(): Log {
        const log = [...this._log];
        log.push({...this._latestActionAndReactions});
        return {
            currentWaits: this._waits,
            currentPendingEvents: this._pendingEvents,
            latestAction: this._latestActionAndReactions.action,
            latestReactionByThreadId: this._latestActionAndReactions.reactionByThreadId,
            actionsAndReactions: log,
            threadsByWait: toThreadsByWait(this._waitsByeventId)
        };
    }

    public resetLog(): void {
        this._log = [];
        this._latestActionAndReactions = newActionsReactions();
    }
}
