import { Action, ActionType } from './action';
import { Reaction, ReactionType } from './reaction';
import { Bid } from './bid';
import { EventMap, FCEvent } from './event';
import { BThreadKey } from './bthread';

interface LogAction extends Action {
    pendingDuration?: number;
    usePromise?: boolean;
}
export interface ActionAndReactions {
    action: LogAction;
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
    latestAction: LogAction;
    latestReactionByThreadId: Record<string, Reaction>;
    actionsAndReactions: ActionAndReactions[];
    threadInfoById: Record<string, ThreadInfo>;
}

function newActionsReactions(action?: Action): ActionAndReactions {
    return {
        action: action ? {...action} : { event: {name: ""}, type: ActionType.initial, threadId: ""},
        reactionByThreadId: {}
    }
}

export class Logger {
    private _log: ActionAndReactions[] = [];
    private _latestActionAndReactions: ActionAndReactions;
    private _waits: EventMap<Bid[]> = new EventMap();
    private _pendingEvents: EventMap<string[]> = new EventMap();
    private _threadInfoById: Record<string, ThreadInfo> = {};
    private _timeOfPromise: EventMap<number> = new EventMap();

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

    public logReaction(threadId: string, type: ReactionType, cancelledPromises?: FCEvent[] | null, event?: FCEvent): void {
        if(event && type === ReactionType.promise) {
            this._timeOfPromise.set(event, new Date().getTime());
        }
        else if(event && (type === ReactionType.resolve || type === ReactionType.reject)) {
            const resolveTime = new Date().getTime();
            const duration = resolveTime - (this._timeOfPromise.get(event) || resolveTime);
            this._latestActionAndReactions.action.pendingDuration = duration;
        }
        const reaction: Reaction = {
            type: type,
            threadId: threadId,
            cancelledPromises: cancelledPromises ? cancelledPromises : undefined
        };
        this._latestActionAndReactions.reactionByThreadId[threadId] = reaction;
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
        this._waits = new EventMap();
        this._pendingEvents = new EventMap();
        this._threadInfoById = {};
        this._timeOfPromise = new EventMap();
    }
}
