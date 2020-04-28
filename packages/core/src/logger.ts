import { Action, ActionType } from './action';
import { Reaction, ReactionType } from './reaction';
import { Bid } from './bid';
import { EventMap, FCEvent } from './event';

export interface ActionAndReactions {
    action: Action;
    reactionByThreadId: Record<string, Reaction>;
}
export type ThreadsByWait = Record<string, string[]>;


export interface Log {
    currentWaits: EventMap<Bid[]>;
    currentPendingEvents: EventMap<Bid[]>;
    latestAction: Action;
    latestReactionByThreadId: Record<string, Reaction>;
    actionsAndReactions: ActionAndReactions[];
}

function newActionsReactions(action?: Action): ActionAndReactions {
    return {
        action: action ? {...action} : { event: {name: ""}, type: ActionType.initial, threadId: "" },
        reactionByThreadId: {}
    }
}

export class Logger {
    private _log: ActionAndReactions[] = [];
    private _latestActionAndReactions: ActionAndReactions;
    private _waits: EventMap<Bid[]> = new EventMap();
    private _pendingEvents: EventMap<Bid[]> = new EventMap();

    public constructor() {
        this._latestActionAndReactions = newActionsReactions();
    }

    public logWaits(waits: EventMap<Bid[]> = new EventMap()): void {
        this._waits = waits;
    }

    public logPendingEvents(pendingEvents: EventMap<Bid[]>): void {
        this._pendingEvents = pendingEvents;
    }

    public logAction(action: Action): void {
        this._log.push(this._latestActionAndReactions);
        this._latestActionAndReactions = newActionsReactions(action);
    }

    public logReaction(threadId: string, type: ReactionType, cancelledPromises?: FCEvent[]): void {
        const reaction: Reaction = {
            type: type,
            threadId: threadId,
            cancelledPromises: cancelledPromises
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
            actionsAndReactions: log
        };
    }

    public resetLog(): void {
        this._log = [];
        this._latestActionAndReactions = newActionsReactions();
    }
}
