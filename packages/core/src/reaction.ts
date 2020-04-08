export enum ReactionType {
    init = "init",
    delete = "delete",
    reset = "reset",
    promise = "promise",
    progress = "progress"
}

export interface Reaction {
    threadId: string;
    type: ReactionType;
    cancelledPromises: string[] | null;
    pendingEvents: string[] | null;
}