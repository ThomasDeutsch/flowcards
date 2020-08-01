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
    cancelledPending?: EventMap<PendingEventInfo>;
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

    public logThreadProgression(threadId: string, bid: Bid, threadSection: string | undefined, cancelledPending: EventMap<PendingEventInfo>, pendingEvents?: EventMap<PendingEventInfo>): void {
        const actionIndex = this._getActionIndex();
        this._actions[actionIndex].reactingBThreads.add(bid.threadId);
        const reaction: BThreadReaction = {
            type: BThreadReactionType.progress,
            actionIndex: actionIndex,
            cancelledPending: cancelledPending,
            threadSection: threadSection,
            event: bid.event,
            bidType: bid.type,
            BidSubType: bid.subType,
            pendingEvents: pendingEvents
        };
        this._bThreadInfoById[threadId].reactions.set(actionIndex, reaction);
    }

    public logThreadReset(threadId: string, changedProps: string[], cancelledPending: EventMap<PendingEventInfo>, currentProps?: Record<string, any>) {
        const actionIndex = this._getActionIndex();
        this._actions[actionIndex].reactingBThreads.add(threadId);
        const reaction: BThreadReaction = {
            type: BThreadReactionType.reset,
            actionIndex: actionIndex,
            changedProps: changedProps,
            cancelledPending: cancelledPending
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


// SAVE A REPLAY
// All Actions and reactions are saved
// 


// A REPLAY CAN START IN 2 WAYS
// 1. Start a replay from an existing log
// 2. Click on an action from the current log

// In Both cases, the log is the test-specification
