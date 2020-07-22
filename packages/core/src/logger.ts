import { Action, ActionType } from './action';
import { BThreadKey } from './bthread';
import { Bid, BThreadBids, BidType, BidSubType, PendingEventInfo } from './bid';
import { FCEvent, EventMap } from './event';

export interface LoggedAction extends Action {
    actionIndex: number;
    reactingBThreads: Set<string>;
}

export interface BThreadInfo {
    id: string;
    enabledInStep: number;
    key?: BThreadKey;
    title?: string;
    reactions: Map<number, BThreadReaction>;
    currentProps?: Record<string, any>;
}

export interface Log {
    actions: LoggedAction[];
    bThreadInfoById: Record<string, BThreadInfo>;
    latestAction: Action;
}

export enum BThreadReactionType {
    progress = "progress",
    reset = "reset",
    promise = "promise",
    extend = "extend",
    extendResolved = "extendResolved",
    extendRejected = "extendRejected"
}

export interface BThreadReaction {
    type: BThreadReactionType;
    actionIndex: number;
    cancelledPending?: FCEvent[];
    pendingEvents?: EventMap<PendingEventInfo>;
    changedProps?: string[];
    threadSection?: string;
    event?: FCEvent;
    bidType?: BidType;
    BidSubType?: BidSubType;
    payload?: any;
}

export class Logger {
    private _actions: LoggedAction[] = [];
    private _bThreadInfoById: Record<string, BThreadInfo> = {};

    private _getActionIndex(): number {
        return this._actions.length-1;
    }

    public logAction(action: Action): void {
        const payload = (action.type === ActionType.promise) ? undefined : action.payload;
        this._actions.push({...action, payload: payload, reactingBThreads: new Set(), actionIndex: this._getActionIndex()+1});
    }

    public addThreadInfo(id: string, title?: string, props?: Record<string, any>) {
        this._bThreadInfoById[id] = {
            id: id, title: title,
            reactions: new Map<number, BThreadReaction>(), 
            enabledInStep: this._getActionIndex()+1,
            currentProps: props
        };
    }

    public logPromise(bid: Bid, threadSection?: string, pendingEvents?: EventMap<PendingEventInfo>): void {
        const actionIndex = this._getActionIndex();
        const reaction: BThreadReaction = {
            type: BThreadReactionType.promise,
            actionIndex: actionIndex,
            event: bid.event,
            bidType: bid.type,
            BidSubType: bid.subType,
            threadSection: threadSection,
            pendingEvents: pendingEvents
        }
        this._bThreadInfoById[bid.threadId].reactions.set(actionIndex, reaction);
    }

    public logExtend(bid: Bid, threadSection?: string, pendingEvents?: EventMap<PendingEventInfo>): void {
        const actionIndex = this._getActionIndex();
        const reaction: BThreadReaction = {
            type: BThreadReactionType.extend,
            actionIndex: actionIndex,
            bidType: bid.type,
            BidSubType: bid.subType,
            threadSection: threadSection,
            pendingEvents: pendingEvents
        }
        this._bThreadInfoById[bid.threadId].reactions.set(actionIndex, reaction);
    }

    public logThreadProgression(threadId: string, bid: Bid, threadSection: string | undefined, cancelledPromises?: FCEvent[], pendingEvents?: EventMap<PendingEventInfo>): void {
        const actionIndex = this._getActionIndex();
        this._actions[actionIndex].reactingBThreads.add(bid.threadId);
        const reaction: BThreadReaction = {
            type: BThreadReactionType.progress,
            actionIndex: actionIndex,
            cancelledPending: cancelledPromises,
            threadSection: threadSection,
            event: bid.event,
            bidType: bid.type,
            BidSubType: bid.subType,
            pendingEvents: pendingEvents
        };
        this._bThreadInfoById[threadId].reactions.set(actionIndex, reaction);
    }

    public logThreadReset(threadId: string, changedProps: string[], cancelledEvents?: FCEvent[], currentProps?: Record<string, any>) {
        const actionIndex = this._getActionIndex();
        this._actions[actionIndex].reactingBThreads.add(threadId);
        const reaction: BThreadReaction = {
            type: BThreadReactionType.reset,
            actionIndex: actionIndex,
            changedProps: changedProps,
            cancelledPending: cancelledEvents
        };
        this._bThreadInfoById[threadId].currentProps = currentProps;
        this._bThreadInfoById[threadId].reactions.set(actionIndex, reaction);
    }

    public logExtendResult(type: BThreadReactionType.extendResolved | BThreadReactionType.extendRejected, threadId: string, event: FCEvent, pendingEvents?: EventMap<PendingEventInfo>) {
        const actionIndex = this._getActionIndex();
        const reaction: BThreadReaction = {
            type: type,
            actionIndex: actionIndex,
            event: event,
            pendingEvents: pendingEvents
        };
        this._bThreadInfoById[threadId].reactions.set(actionIndex, reaction);
    }

    public logOnDestroy(threadId: string) {
        delete this._bThreadInfoById[threadId];
    }

    public getLog(): Log {
        return {
            actions: this._actions,
            latestAction: this._actions[this._actions.length-1],
            bThreadInfoById: this._bThreadInfoById
        };
    }

    public resetLog(): void {
        this._actions = [];
        this._bThreadInfoById = {};  
    }
}


// REPLAY START
// - the debugger will load the complete action-sequence (log)
// - based on this action sequence, a replay will be selected ( only actions until an unresolved action (before this action) can be selected )
// - if the user selects an action, a sequence will be replayed
// - during the replay, the log is compared to the logged reactions ( later, the user is able to add payload tests  )
// - when the action is reached, the replay will still be active, unless the last action is called
// - also, the reached action (if not the last) will pause the replay!



// DURING A REPLAY ( UNRESOLVED ASYNC REQUESTS )
// - unresolved async requests need to be re-triggered
// - if a async-resolve happens, it will add the result to the complete action-sequence (log)
// - The replay is finished, if a dispatch is made or the replay-actions are completed
// - If a dispatch is made during a replay, a new branch is created.
// - in a replay, the log is not thrown away

// -> a in-a-replay flag is needed
//   - during a replay, all unfinished promises will be re-called, but the resolve/reject will only fire, after the replay is finished.
//   - a replay can be paused
//   - 