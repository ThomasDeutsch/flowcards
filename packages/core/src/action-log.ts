import { Action } from './action';
import { Bid } from './bid';
import { BThreadId } from './bthread';
import { BThreadMap } from './bthread-map';

export enum BThreadReactionType {
    progress = 'progress',
}

interface BThreadProgressReaction {
    type: BThreadReactionType.progress;
    selectedBid: Bid;
    actualPayload: any;
}

export class ActionLog {
    public actions: Action[] = [];
    public enabledBThreadIds = new Map<number, string[]>();
    public bThreadReactionHistory = new BThreadMap<Map<number, BThreadProgressReaction>>();

    public logAction(action: Action): void {
        this.actions.push({...action});
        if(action.resolve) {
            this.actions[action.resolve.requestLoopIndex].resolveLoopIndex = action.loopIndex!;
        }
    }

    public logEnabledBThreadIds(actionIndex: number, ids: string[]) {
        this.enabledBThreadIds.set(actionIndex, ids);
    }

    public logBThreadProgress(bThreadId: BThreadId, bid: Bid, actualPayload: any) {
        let currentHistory = this.bThreadReactionHistory.get(bThreadId);
        if(currentHistory === undefined) {
            this.bThreadReactionHistory.set(bThreadId, new Map<number, BThreadProgressReaction>());
            currentHistory = this.bThreadReactionHistory.get(bThreadId);
        }
        currentHistory!.set(this.actions.length-1, {type: BThreadReactionType.progress, selectedBid: bid, actualPayload: actualPayload});
    }

    public resetLog(): void {
        this.actions = [];
    }
}
