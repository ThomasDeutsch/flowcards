import { PlacedBid } from './bid';
import * as utils from './utils';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { AnyActionWithId, RequestedAction } from './action';
import { AllPlacedBids } from '.';


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

// TODO: Make the logger optional.
export class Logger {
    private _actionHistory: AnyActionWithId[] = [];
    public get actionHistory(): AnyActionWithId[] { return this._actionHistory; }
    private _involvedScenarios = new NameKeyMap<true>();
    public get involvedScenarios(): NameKeyMap<true> { return this._involvedScenarios; }
    private _bThreadReactionHistory = new NameKeyMap<Map<number, BThreadReaction>>();
    public get bThreadReactionHistory(): NameKeyMap<Map<number, BThreadReaction>> { return this._bThreadReactionHistory }
    private _placedBidsHistory = new Map<number, AllPlacedBids>();
    public get placedBidsHistory(): Map<number, AllPlacedBids> { return this._placedBidsHistory }
    private _involvedScenariosHistory = new Map<number, NameKeyMap<true>>();
    public get involvedScenariosHistory(): Map<number, NameKeyMap<true>> { return this._involvedScenariosHistory }

    private _currentActionId(): number {
        return utils.latest(this._actionHistory)?.id || 0;
    }

    public logAction(action: AnyActionWithId): void {
        const a = {...action};
        if(action.type === "resolveAction") {
            const requestAction = this._actionHistory[action.requestActionId] as RequestedAction;
            requestAction.resolveActionId = action.id;
        }
        if(action.type === "requestedAction" && action.resolveActionId === 'pending') {
            delete a.payload; // do not save the promise object
        }
        this._actionHistory.push(a);
    }

    private _getBThreadReactions(bThreadId: NameKeyId): Map<number, BThreadReaction> {
        let bThreadReactions = this._bThreadReactionHistory.get(bThreadId);
        if(bThreadReactions === undefined) {
            bThreadReactions = new Map<number, BThreadReaction>()
            this._bThreadReactionHistory.set(bThreadId, bThreadReactions);
        }
        return bThreadReactions;
    }

    public logInvolvedScenarios(bThreadIds: NameKeyId[]): void {
        this._involvedScenariosHistory.set(this._currentActionId(), new NameKeyMap());
        const map = this._involvedScenariosHistory.get(this._currentActionId())!;
        bThreadIds.forEach(id => {
            this._involvedScenarios?.set(id, true);
            map.set(id, true);
        })
    }

    public logPlacedBids(bids: AllPlacedBids): void {
        this._placedBidsHistory.set(this._currentActionId(), bids);
    }

    public logReaction(reactionType: BThreadReactionType, bThreadId: NameKeyId, bid?: PlacedBid): void {
        this._involvedScenarios.set(bThreadId, true);
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentActionId = this._currentActionId();
        bThreadReactions.set(currentActionId, {
            reactionType: reactionType,
            actionId: currentActionId,
            selectedBid: bid
        });
    }

    public resetLog(): void {
        this._actionHistory = [];
        this._involvedScenarios = new NameKeyMap<true>();
        this._involvedScenariosHistory = new Map();
        this._bThreadReactionHistory = new NameKeyMap();
        this._placedBidsHistory = new Map();
    }
}
