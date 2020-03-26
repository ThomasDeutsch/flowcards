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

interface ActionLog {
    pastActions: Action[];
    latestReactions: LatestReactionInfo;
}

interface ActionAndReactions {
    action: Action;
    reactionDictionary: Record<string, Reaction>;
}

interface LatestReactionInfo {
    threadIds: Set<string>;
    pendingEvents: Set<string>;
    type: Record<string, ReactionType>;
}

export class Logger {
    private _log: ActionAndReactions[] = [];
    private _latestActionAndReactions: ActionAndReactions;

    private _getNewActionsReactions(action?: Action): ActionAndReactions {
        return this._latestActionAndReactions = {
            action: action ? {...action} : { eventName: "", type: ActionType.init },
            reactionDictionary: {}
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
        this._latestActionAndReactions.reactionDictionary[reaction.threadId] = reaction;
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

    public getLatestReactions(): LatestReactionInfo  {
        const reactionThreadIds = Object.keys(this._latestActionAndReactions.reactionDictionary);
        return {
            threadIds: new Set(reactionThreadIds),
            pendingEvents: Object.keys(reactionThreadIds).reduce((acc, threadId: string): Set<string> => {
                const thread = this._latestActionAndReactions.reactionDictionary[threadId];
                const pe = thread ? this._latestActionAndReactions.reactionDictionary[threadId].pendingEvents : null;
                if(pe) {
                    return new Set([...acc, ...pe]);
                }
                return acc;
            }, new Set<string>()),
            type: reactionThreadIds.reduce((acc: Record<string, ReactionType>, threadId: string): Record<string, ReactionType> => {
                acc[threadId] = this._latestActionAndReactions.reactionDictionary[threadId].type;
                return acc;
            }, {})
        }
    }

    public getActionLog(): ActionLog {
        return {
            pastActions: [...this._log.map((x):Action => x.action), this._latestActionAndReactions.action],
            latestReactions: this.getLatestReactions()
        }
    }
}
