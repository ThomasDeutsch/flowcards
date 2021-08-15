import { PlacedBid } from './bid';
import * as utils from './utils';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { AnyActionWithId, RequestedAction } from './action';
import { BThreadPublicContext } from './bthread';

export enum BThreadReactionType {
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
    public involvedBThreadsForNextRequestingBid = new Map<number, NameKeyMap<true>>();
    public bThreadReactionHistory = new NameKeyMap<Map<number, BThreadReaction>>();
    public pendingNameKeyIdHistory = new Map<number, Set<NameKeyId> | undefined>();
    public bThreadStateHistory = new Map<number, NameKeyMap<BThreadPublicContext>>();


    private _currentActionId(): number {
        return utils.latest(this._actions)?.id || 0;
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
        // TODO: create a copy of payload with: JSON.parse(JSON.stringify(foo));
        // TODO: Make the logger optional.
        this._actions.push(a);
    }

    private _getBThreadReactions(bThreadId: NameKeyId): Map<number, BThreadReaction> {
        let bThreadReactions = this.bThreadReactionHistory.get(bThreadId);
        if(bThreadReactions === undefined) {
            bThreadReactions = new Map<number, BThreadReaction>()
            this.bThreadReactionHistory.set(bThreadId, bThreadReactions);
        }
        return bThreadReactions;
    }

    public logInvolvedBThreadsForNextRequestingBid(bThradIds: NameKeyId[]): void {
        let bThreads = this.involvedBThreadsForNextRequestingBid.get(this._currentActionId());
        if(bThreads === undefined) {
            bThreads = new NameKeyMap<true>()
            this.involvedBThreadsForNextRequestingBid.set(this._currentActionId(), bThreads);
        }
        bThradIds.forEach(id => {
            bThreads?.set(id, true);
        })
    }

    public logReaction(reactionType: BThreadReactionType, bThreadId: NameKeyId, bid?: PlacedBid): void {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentActionId = this._currentActionId();
        bThreadReactions.set(currentActionId, {
            reactionType: reactionType,
            actionId: currentActionId,
            selectedBid: bid
        });
    }

    // TODO: not used! - remove?
    public logBThreadStateMap(bThreadStateMap: NameKeyMap<BThreadPublicContext>): void {
        this.bThreadStateHistory.set(this._currentActionId(), bThreadStateMap.clone());
    }

    public resetLog(): void {
        this._actions = [];
        this.bThreadReactionHistory = new NameKeyMap();
        this.pendingNameKeyIdHistory = new Map();
        this.bThreadStateHistory = new Map();
    }
}
