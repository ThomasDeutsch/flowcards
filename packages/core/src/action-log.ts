import { Action } from './action';
import { Bid } from './bid';
import { BThreadId } from './bthread';
import { BThreadMap } from './bthread-map';
import * as utils from './utils';

export enum BThreadReactionType {
    // enable = 'enable'  <- enable can not be a reactin, because it happens before the action is selected.
    progress = 'progress',
    reset = 'reset',
    destroy = 'destroy'
}

interface BThreadProgressReaction {
    type: BThreadReactionType.progress;
    selectedBid: Bid;
    actualPayload: any;
}

interface BThreadResetReaction {
    type: BThreadReactionType.reset;
    changedPropNames: string[];
}

type BThreadReaction = BThreadProgressReaction | BThreadResetReaction;

export class ActionLog {
    public actions: Action[] = [];
    public enabledBThreadIds = new Map<number, string[]>();
    public bThreadReactionHistory = new Map<number, Map<string, BThreadReaction>>();

    public logAction(action: Action): void {
        this.actions.push({...action});
        if(action.resolve) {
            this.actions[action.resolve.requestLoopIndex].resolveLoopIndex = action.loopIndex!;
        }
    }

    public logEnabledBThreadIds(actionIndex: number, ids: string[]) {
        this.enabledBThreadIds.set(actionIndex, ids);
    }

    private _getLoopReactions(): Map<string, BThreadReaction> {
        const currentLoopIndex = utils.latest(this.actions)!.loopIndex!;
        let loopReactions = this.bThreadReactionHistory.get(currentLoopIndex);
        if(loopReactions === undefined) {
            loopReactions = new Map<string, BThreadReaction>()
            this.bThreadReactionHistory.set(currentLoopIndex, loopReactions);
        }
        return loopReactions;
    }

    public logBThreadProgress(bThreadId: BThreadId, bid: Bid, actualPayload: any) {
        const loopReactions = this._getLoopReactions();
        const bThreadIdString = BThreadMap.toIdString(bThreadId);
        loopReactions!.set(bThreadIdString, {type: BThreadReactionType.progress, selectedBid: bid, actualPayload: actualPayload});
    }

    public logBThreadReset(bThreadId: BThreadId, changedPropNames: string[]) {
        const loopReactions = this._getLoopReactions();
        const bThreadIdString = BThreadMap.toIdString(bThreadId);
        loopReactions!.set(bThreadIdString, {type: BThreadReactionType.reset, changedPropNames: changedPropNames});
    }

    public resetLog(): void {
        this.actions = [];
    }
}
