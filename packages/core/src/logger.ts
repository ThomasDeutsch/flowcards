import { Action, ActionType } from './action';
import { Reaction, ReactionType } from './reaction';

export interface ActionAndReactions {
    action: Action;
    reactionByThreadId: Record<string, Reaction>;
}

export type PendingEventsByThreadId = Record<string, string[]>;

export interface Log {
    actionsAndReactions: ActionAndReactions[],
    pendingEventsByThreadId: PendingEventsByThreadId;
}

function newActionsReactions(action?: Action): ActionAndReactions {
    return {
        action: action ? {...action} : { eventName: "", type: ActionType.init },
        reactionByThreadId: {}
    }
}

export class Logger {
    private _log: ActionAndReactions[] = [];
    private _latestActionAndReactions: ActionAndReactions;
    private _pendingEventsByThreadId: PendingEventsByThreadId = {};

    public constructor() {
        this._latestActionAndReactions = newActionsReactions();
    }

    public resetLog(): void {
        this._log = [];
        this._latestActionAndReactions = newActionsReactions();
        this._pendingEventsByThreadId = {};
    }

    public logAction(action: Action): void {
        this._log.push(this._latestActionAndReactions);
        this._latestActionAndReactions = newActionsReactions(action);
    }

    public logReaction(threadId: string, type: ReactionType, cancelledPromises: string[] | null = null, pendingEvents: Set<string> | null = null): void {
        const pendingEventsArray = pendingEvents ? Array.from(pendingEvents) : null;
        const reaction: Reaction = {
            type: type,
            threadId: threadId,
            cancelledPromises: cancelledPromises,
            pendingEvents: null
        };
        if(pendingEventsArray && pendingEventsArray.length > 0) {
            this._pendingEventsByThreadId[threadId] = pendingEventsArray;
            reaction.pendingEvents = pendingEventsArray;
        } else {
            delete this._pendingEventsByThreadId[threadId];
        }
        this._latestActionAndReactions.reactionByThreadId[reaction.threadId] = reaction;
    }

    public getLog(): Log {
        const log = [...this._log];
        log.push({...this._latestActionAndReactions});
        return {
            actionsAndReactions: log,
            pendingEventsByThreadId: {...this._pendingEventsByThreadId}
        };
    }
}
