import { Action } from './action';
import { Bid } from './bid';
import { EventMap } from './event';
import { PendingEventInfo } from './bthread';

export interface Reaction {
    type: 'progress' | 'reset' | 'pending';
    bid?: Bid;
    cancelledPending?: EventMap<PendingEventInfo>;
    changedProps?: string[];
    pendingEventInfo?: PendingEventInfo;
}

export class Logger {
    public actions: Action[] = [];
    public reactions: Map<string, Reaction>[] = [];

    // log action

    public logAction(action: Action): void {
        this.actions.push({...action});
        this.reactions.push(new Map());
        if(action.resolve) {
            this.actions[action.resolve.requestedActionIndex].resolvedActionIndex = action.index!;
        }
    }

    // log reactions

    public logPending(bid: Bid, pendingEventInfo: PendingEventInfo): void {
        const reaction: Reaction = {
            type: 'pending',
            bid: bid,
            pendingEventInfo: pendingEventInfo
        }
        this.reactions[this.actions.length-1].set(bid.threadId, reaction);
    }

    public logProgress(bid: Bid, cancelledPending: EventMap<PendingEventInfo>): void {
        const reaction: Reaction = {
            type: 'progress',
            bid: bid,
            cancelledPending: cancelledPending
        };
        this.reactions[this.actions.length-1].set(bid.threadId, reaction);
    }

    public logReset(threadId: string, changedProps: string[], cancelledPending: EventMap<PendingEventInfo>) {
        const reaction: Reaction = {
            type: 'reset',
            changedProps: changedProps,
            cancelledPending: cancelledPending
        };
        this.reactions[this.actions.length-1].set(threadId, reaction);
    }

    public resetLog(): void {
        this.actions = [];
        this.reactions = [];
    }
}
