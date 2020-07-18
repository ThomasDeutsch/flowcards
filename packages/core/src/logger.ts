import { Action, ActionType } from './action';
import { BThreadKey } from './bthread';
import { Bid, BThreadBids, BidType, BidSubType } from './bid';
import { FCEvent } from './event';

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
    pendingEvents?: FCEvent[];
    props: any;
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
    pendingEvents?: FCEvent[];
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

    public addThreadInfo(id: string, title?: string, props?: any) {
        this._bThreadInfoById[id] = {
            id: id, title: title,
            reactions: new Map<number, BThreadReaction>(), 
            enabledInStep: this._getActionIndex()+1,
            pendingEvents: [],
            props: props
        };
    }

    public logPromise(bid: Bid, threadSection?: string, pendingEvents?: FCEvent[]): void {
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
        this._bThreadInfoById[bid.threadId].pendingEvents = pendingEvents;
        this._bThreadInfoById[bid.threadId].reactions.set(actionIndex, reaction);
    }

    public logExtend(bid: Bid, threadSection?: string, pendingEvents?: FCEvent[]): void {
        const actionIndex = this._getActionIndex();
        const reaction: BThreadReaction = {
            type: BThreadReactionType.extend,
            actionIndex: actionIndex,
            bidType: bid.type,
            BidSubType: bid.subType,
            threadSection: threadSection,
            pendingEvents: pendingEvents
        }
        this._bThreadInfoById[bid.threadId].pendingEvents = pendingEvents;
        this._bThreadInfoById[bid.threadId].reactions.set(actionIndex, reaction);
    }

    public logThreadProgression(threadId: string, bid: Bid, threadSection: string | undefined, cancelledPromises?: FCEvent[], pendingEvents?: FCEvent[]): void {
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
        this._bThreadInfoById[bid.threadId].pendingEvents = pendingEvents;
        this._bThreadInfoById[threadId].reactions.set(actionIndex, reaction);
    }

    public logThreadReset(threadId: string, changedProps: string[], cancelledEvents?: FCEvent[], ) {
        const actionIndex = this._getActionIndex();
        this._actions[actionIndex].reactingBThreads.add(threadId);
        const reaction: BThreadReaction = {
            type: BThreadReactionType.reset,
            actionIndex: actionIndex,
            changedProps: changedProps,
            cancelledPending: cancelledEvents
        };
        this._bThreadInfoById[threadId].reactions.set(actionIndex, reaction);
    }

    public logExtendResult(type: BThreadReactionType.extendResolved | BThreadReactionType.extendRejected, threadId: string, event: FCEvent, pendingEvents?: FCEvent[]) {
        const actionIndex = this._getActionIndex();
        const reaction: BThreadReaction = {
            type: type,
            actionIndex: actionIndex,
            event: event
        };
        this._bThreadInfoById[threadId].pendingEvents = pendingEvents;
        this._bThreadInfoById[threadId].reactions.set(actionIndex, reaction);
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
