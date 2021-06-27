import { PlacedBid } from './bid';
import { BThreadMap } from './bthread-map';
import * as utils from './utils';
import { BThreadId, BThreadState } from './bthread';
import { EventId, EventMap } from './event-map';
import { AnyActionWithId, RequestedAction } from './action';

export enum BThreadReactionType {
    init = 'init',
    progress = 'progress',
    error = 'error',
    newPending = 'newPending',
    resolvedExtend = 'resolvedExtend'
}

export interface BThreadReaction {
    reactionType: BThreadReactionType;
    actionId: number;
    selectedBid?: PlacedBid;
}

export class Logger {
    private _actions: AnyActionWithId[] = [];
    public get actions(): AnyActionWithId[] { return this._actions; }
    public bThreadReactionHistory = new BThreadMap<Map<number, BThreadReaction>>();
    public pendingEventIdHistory = new Map<number, Set<EventId> | undefined>();
    public bThreadStateHistory = new Map<number, BThreadMap<BThreadState>>();

    private _currentActionId(): number {
        return utils.latest(this._actions)?.id || 0;
    }

    public logPendingEventIds(pending: EventMap<PlacedBid[]> | undefined): void {
        const eventIds = pending?.allKeys;
        this.pendingEventIdHistory.set(this._currentActionId(), eventIds);
    }

    public logAction(action: AnyActionWithId): void {
        const a = {...action}
        if(action.type === "resolveAction") {
            const requestAction = this._actions[action.requestActionId] as RequestedAction;
            requestAction.resolveActionId = action.id;
        }
        if(action.type === "requestedAction" && action.resolveActionId === 'pending') {
            a.payload = undefined; // do not save the promise object
        }
        this._actions.push(a);
    }

    private _getBThreadReactions(bThreadId: BThreadId): Map<number, BThreadReaction> {
        let bThreadReactions = this.bThreadReactionHistory.get(bThreadId);
        if(bThreadReactions === undefined) {
            bThreadReactions = new Map<number, BThreadReaction>()
            this.bThreadReactionHistory.set(bThreadId, bThreadReactions);
        }
        return bThreadReactions;
    }

    public logReaction(reactionType: BThreadReactionType, bThreadId: BThreadId, bid?: PlacedBid): void {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentActionId = this._currentActionId();
        bThreadReactions.set(currentActionId, {
            reactionType: reactionType,
            actionId: currentActionId,
            selectedBid: bid
        });
    }

    public logBThreadStateMap(bThreadStateMap: BThreadMap<BThreadState>): void {
        this.bThreadStateHistory.set(this._currentActionId(), bThreadStateMap);
    }

    public resetLog(): void {
        this._actions = [];
        this.bThreadReactionHistory = new BThreadMap();
        this.pendingEventIdHistory = new Map();
        this.bThreadStateHistory = new Map();
    }
}
