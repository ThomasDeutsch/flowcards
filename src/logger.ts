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
    cancelledPromises?: string[];
}

interface ReactionDictionary {
    [Key: string]: Reaction;
}

class LoopLog {
    readonly action: Action;
    public reactionDictionary: ReactionDictionary = {};
    constructor(action?: Action) {
        this.action = action || {eventName: "_INIT"} as Action;
    }

    public addReaction(reaction: Reaction): void {
        this.reactionDictionary[reaction.threadId] = reaction;
    }
}

export class Logger {
    private _log: LoopLog[] = [];
    private _currentLoopLog: LoopLog;
    private _pendingEventNames: Set<string> = new Set();

    constructor() {
        this._currentLoopLog = new LoopLog();
    }

    public logAction(action: Action): void {
        this._log.push(this._currentLoopLog);
        this._currentLoopLog = new LoopLog(action);
        if(action.type === ActionType.resolve) {
            this._pendingEventNames.delete(action.eventName);
        }
        //console.log('action: ', action);
    }

    public logReaction(threadId: string, type: ReactionType, cancelledPromises?: string[]): void {
        const reaction: Reaction = {
            type: type,
            threadId: threadId,
            cancelledPromises: cancelledPromises
        };
        this._currentLoopLog.addReaction(reaction);
        if(reaction.type === ReactionType.promise) {
            this._pendingEventNames.add(this._currentLoopLog.action.eventName);
        }
        if(cancelledPromises) {
            cancelledPromises.map(name => this._pendingEventNames.delete(name));
        }
    }

    public getLog(): string {
        return JSON.stringify(this._log);
    }

    public getLatestAction() {
        return this._currentLoopLog.action;
    }

    public getLatestReactionThreads(): Set<string> {
        return new Set(Object.keys(this._currentLoopLog.reactionDictionary));
    }

    public getLatestReactions() {
        return this._currentLoopLog.reactionDictionary;
    }

    public getActionLog() {
        let pastActions = [...this._log, this._currentLoopLog]
            .filter((a) => a.action.type === ActionType.waited || a.action.type === ActionType.resolve)
            .map(l => (l.action.type === ActionType.resolve) ? `${l.action.eventName} - completed` : l.action.eventName);
        return {
            pastActions: pastActions,
            pendingEventNames: this._pendingEventNames
        }
    }
}
