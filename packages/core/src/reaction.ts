import { FCEvent } from './event';

export enum ReactionType {
    reset = "reset",
    promise = "promise",
    progress = "progress",
    resolve = "resolve",
    reject = "reject"
}

export interface Reaction {
    actionIndex: number;
    type: ReactionType;
    cancelledPromises?: FCEvent[];
    pendingEvents?: string[];
}
