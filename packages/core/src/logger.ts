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
    cancelledEvents?: Set<string>;
    pendingEvents?: Set<string>;
}

interface ActionLog {
    pastActions: string[];
    latestReactions: ReactionInfo;
}

class LoopLog {
    public readonly action: Action;
    public reactionDictionary: Record<string, Reaction> = {};
    public constructor(action?: Action) {
        this.action = action || {eventName: "", type: ActionType.init};
    }

    public addReaction(reaction: Reaction): void {
        this.reactionDictionary[reaction.threadId] = reaction;
    }
}


interface ReactionInfo {
    threadIds: Set<string>;
    pendingEvents: Set<string>;
    type: Record<string, ReactionType>;
}

export class Logger {
    private _log: LoopLog[] = [];
    private _currentLoopLog: LoopLog;

    public constructor() {
        this._currentLoopLog = new LoopLog();
    }

    public logAction(action: Action): void {
        this._log.push(this._currentLoopLog);
        this._currentLoopLog = new LoopLog(action);
    }

    public logReaction(threadId: string, type: ReactionType, cancelledEvents?: Set<string>, pendingEvents?: Set<string>): void {
        const reaction: Reaction = {
            type: type,
            threadId: threadId,
            cancelledEvents: cancelledEvents,
            pendingEvents: pendingEvents
        };
        this._currentLoopLog.addReaction(reaction);
    }

    public getLog(): string {
        return JSON.stringify(this._log);
    }

    public getLatestAction(): Action {
        return this._currentLoopLog.action;
    }


    public getLatestReactions(): ReactionInfo  {
        const reactionThreadIds = Object.keys(this._currentLoopLog.reactionDictionary);
        return {
            threadIds: new Set(reactionThreadIds),
            pendingEvents: Object.keys(reactionThreadIds).reduce((acc, threadId: string): Set<string> => {
                const thread = this._currentLoopLog.reactionDictionary[threadId];
                const pe = thread ? this._currentLoopLog.reactionDictionary[threadId].pendingEvents : null;
                if(pe) {
                    return new Set([...acc, ...pe]);
                }
                return acc;
            }, new Set<string>()),
            type: reactionThreadIds.reduce((acc: Record<string, ReactionType>, threadId: string): Record<string, ReactionType> => {
                acc[threadId] = this._currentLoopLog.reactionDictionary[threadId].type;
                return acc;
            }, {})
        }
    }

    public getActionLog(): ActionLog {
        const pastActions = [...this._log, this._currentLoopLog]
            .filter((a): boolean => a.action.type === ActionType.waited || a.action.type === ActionType.resolve)
            .map((l): string => (l.action.type === ActionType.resolve) ? `${l.action.eventName} - completed` : l.action.eventName);
        return {
            pastActions: pastActions,
            latestReactions: this.getLatestReactions()
        }
    }
}
