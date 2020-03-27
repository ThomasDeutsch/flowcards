import { Action, ActionType } from './action';

export enum ReactionType {
    init = "init",
    delete = "delete",
    reset = "reset",
    promise = "promise",
    progress = "progress"
}

interface Reaction {
    threadId: string;
    type: ReactionType;
    cancelledEvents: Set<string> | null;
    pendingEvents: Set<string> | null;
}

interface ActionAndReactions {
    action: Action;
    reactionByThreadId: Record<string, Reaction>;
}

export class Logger {
    private _log: ActionAndReactions[] = [];
    private _latestActionAndReactions: ActionAndReactions;
    private _pendingEventsByThreadId: Record<string, Set<string>> = {};

    private _getNewActionsReactions(action?: Action): ActionAndReactions {
        return this._latestActionAndReactions = {
            action: action ? {...action} : { eventName: "", type: ActionType.init },
            reactionByThreadId: {}
        }
    }

    public constructor() {
        this._latestActionAndReactions = this._getNewActionsReactions();
    }

    public logAction(action: Action): void {
        this._log.push(this._latestActionAndReactions);
        this._latestActionAndReactions = this._getNewActionsReactions(action);
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

    public getCompleteLog() : ActionAndReactions[] {
        const log = [...this._log];
        log.push(this._latestActionAndReactions);
        return log;
    }

    public getJSONString(): string {
        return JSON.stringify(this.getCompleteLog());
    }

    public getLatestAction(): Action {
        return this._latestActionAndReactions.action;
    }

    public getLatestReactionsByThreadId(): Record<string, Reaction>  {
        return this._latestActionAndReactions.reactionByThreadId
    }

    public getPendingEventsByThreadId(): Record<string, Set<string>> {
        return this._pendingEventsByThreadId;
    }

    public getPendingEventNames(): string[] {
        return Object.keys(this._pendingEventsByThreadId).reduce((acc: string[], threadId): string[] => [...acc, ...Array.from(this._pendingEventsByThreadId[threadId])], []);
    }
}
