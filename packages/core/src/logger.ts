import { Action, ActionType } from './action';
import { Reaction, ReactionType } from './reaction';
import { Bid } from './bid';
import { EventMap, FCEvent } from './event';
import { BThreadKey } from './bthread';

export interface ActionAndReactions {
    action: Action;
    reactionByThreadId: Record<string, Reaction>;
}
export type ThreadsByWait = Record<string, string[]>;

interface ThreadInfo {
    key?: BThreadKey;
    title?: string;
}

export interface Log {
    currentWaits: EventMap<Bid[]>;
    currentPendingEvents: EventMap<string[]>;
    latestAction: Action;
    latestReactionByThreadId: Record<string, Reaction>;
    actionsAndReactions: ActionAndReactions[];
    threadInfoById: Record<string, ThreadInfo>;
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
    private _pendingEvents: EventMap<string[]> = new EventMap();
    private _threadInfoById: Record<string, ThreadInfo> = {};

    public constructor() {
        this._latestActionAndReactions = newActionsReactions();
    }

    public addThreadInfo(id: string, info: ThreadInfo) {
        this._threadInfoById[id] = {...info};
    }

    public logWaits(waits: EventMap<Bid[]> = new EventMap()): void {
        this._waits = waits;
    }

    public logPendingEvents(pendingEvents: EventMap<Bid[]>): void {
        this._pendingEvents = pendingEvents.map((event, bids) => bids.map(bid => bid.threadId));
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
            threadInfoById: this._threadInfoById,
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
