import { FCEvent } from './event';

export enum ReactionType {
    reset = "reset",
    progress = "progress"
}

export interface Reaction {
    actionIndex: number;
    type: ReactionType;
    cancelledPromises?: FCEvent[];
}
