import { Action, ActionType } from './action';
import { Reaction, ReactionType } from './reaction';
import { Bid } from './bid';

export interface ActionAndReactions {
    action: Action;
    reactionByThreadId: Record<string, Reaction>;
}

export type PendingEventsByThreadId = Record<string, string[]>;
export type ThreadsByWait = Record<string, string[]>;


export interface Log {
    actionsAndReactions: ActionAndReactions[];
    pendingEventsByThreadId: PendingEventsByThreadId;
    threadsByWait: ThreadsByWait;
}

function newActionsReactions(action?: Action): ActionAndReactions {
    return {
        action: action ? {...action} : { eventName: "", type: ActionType.init },
        reactionByThreadId: {}
    }
}


function toThreadsByWait(wbt: Record<string, Bid[]>): ThreadsByWait {
    return Object.keys(wbt).reduce((tfw: ThreadsByWait, threadId: string): ThreadsByWait => {
        wbt[threadId].map(bid => bid.eventName).forEach(wait => {
            if(!tfw[wait]) tfw[wait] = [threadId];
            else tfw[wait].push(threadId);
        });
        return tfw;
    }, {});
}

export class Logger {
    private _log: ActionAndReactions[] = [];
    private _latestActionAndReactions: ActionAndReactions;
    private _pendingEventsByThreadId: PendingEventsByThreadId = {};
    private _waitsByBThreadId: Record<string, Bid[]> = {};

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

    public logWaits(waits: Record<string, Bid[]>) {
        this._waitsByBThreadId = waits;
    }

    public getLog(): Log {
        const log = [...this._log];
        log.push({...this._latestActionAndReactions});
        return {
            actionsAndReactions: log,
            pendingEventsByThreadId: {...this._pendingEventsByThreadId},
            threadsByWait: toThreadsByWait(this._waitsByBThreadId)
        };
    }
}
