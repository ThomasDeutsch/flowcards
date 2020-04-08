import { Action, ActionType } from './action';
import { Reaction, ReactionType } from './reaction';

interface ActionAndReactions {
    action: Action;
    reactionByThreadId: Record<string, Reaction>;
}

export interface Log {
    actionsAndReactions: ActionAndReactions[],
    pendingEventsByThreadId: Record<string, Set<string>>;
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
    private _pendingEventsByThreadId: Record<string, Set<string>> = {};

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

    public logReaction(threadId: string, type: ReactionType, cancelledEvents: Set<string> | null = null, pendingEvents: Set<string> | null = null): void {
        const reaction: Reaction = {
            type: type,
            threadId: threadId,
            cancelledEvents: cancelledEvents,
            pendingEvents: pendingEvents
        };
        if(pendingEvents) {
            this._pendingEventsByThreadId[threadId] = pendingEvents;
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
