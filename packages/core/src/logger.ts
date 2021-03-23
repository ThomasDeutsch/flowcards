import { PlacedBid } from './bid';
import { BThreadMap } from './bthread-map';
import * as utils from './utils';
import { BThreadId, BThreadState } from './bthread';
import { EventMap } from './event-map';
import { BidType } from './bid';
import { ActionType, ReplayAction, RequestedAction } from './action';

export enum BThreadReactionType {
    init = 'init',
    progress = 'progress',
    error = 'error',
    newPending = 'newPending'
}

export interface BThreadReaction {
    reactionType: BThreadReactionType;
    actionId: number;
    selectedBid?: PlacedBid;
    bids?: Record<BidType, EventMap<PlacedBid>>;
    section?: string;
    isCompleted: boolean;
    progressionCount: number;
}

export enum ScaffoldingResultType {
    enabled = 'enabled',
    disabled = 'disabled',
    reset = 'reset',
    destroyed = 'destroyed',
}

export class Logger {
    private _actionId = 0;
    public set actionId(id: number) {
        this._actionId = id;
    }
    private _actions: ReplayAction[] = [];
    public get actions(): ReplayAction[] { return this._actions; }
    public bThreadReactionHistory = new BThreadMap<Map<number, BThreadReaction>>();
    public bThreadScaffoldingHistory = new BThreadMap<Map<number, ScaffoldingResultType>>();

    public logScaffoldingResult(type: ScaffoldingResultType, bThreadId: BThreadId): void {
        let bThreadHistory = this.bThreadScaffoldingHistory.get(bThreadId);
        if(bThreadHistory === undefined) {
            bThreadHistory = this.bThreadScaffoldingHistory.set(bThreadId, new Map()).get(bThreadId);
        }
        bThreadHistory!.set(this._actionId, type);
    }

    public logAction(action: ReplayAction): void {
        const a = {...action}
        if(action.type === ActionType.resolved) {
            const requestAction = this._actions[action.requestActionId] as RequestedAction;
            requestAction.resolveActionId = action.id;
        }
        if(action.type === ActionType.requested && action.resolveActionId === 'notResolved') {
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

    public logReaction(reactionType: BThreadReactionType, bThreadId: BThreadId, state: BThreadState, bid?: PlacedBid): void {
        const bThreadReactions = this._getBThreadReactions(bThreadId);
        const currentActionId = utils.latest(this._actions)?.id || 0;
        bThreadReactions.set(currentActionId, {
            reactionType: reactionType,
            actionId: currentActionId,
            selectedBid: bid,
            progressionCount: state.progressionCount,
            bids: state.bids,
            section: state.section,
            isCompleted: state.isCompleted
        });
    }

    public resetLog(): void {
        this._actionId = 0;
        this._actions = [];
        this.bThreadReactionHistory = new BThreadMap();
        this.bThreadScaffoldingHistory = new BThreadMap();
    }
}