import { FCEvent } from './event';

export enum ReactionType {
    init = "init",
    reset = "reset",
    promise = "promise",
    progress = "progress",
    resolve = "resolve",
    reject = "reject"
}

export interface Reaction {
    stepNr: number;
    type: ReactionType;
    cancelledPromises?: FCEvent[];
    pendingEvents?: string[];
}
