import { isGlob } from "$std/path/glob.ts";
import { LoggedAction } from "./action.ts";
import { InvalidBidReason } from "./bid-invalid-reasons.ts";
import { FlowReaction, FlowReactionDetails, FlowReactionType } from "./flow-reaction.ts";
import { AccumulatedValidationResults, Action, Engine } from "./index.ts";


// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

export type AugmentedAction<P> = LoggedAction<P> & {
    resolvedBy?: number;
    rejectedBy?: number;
    cancelledBy?: number;
    extenedBy?: string[];
}


export interface ActionAndReactions {
    action?: AugmentedAction<any>,
    reactions?: FlowReaction[],
    tests?: {[key:string]: (engine: Engine) => void},
    // DEBUG:
    invalidActionInfo?: {
        invalidBidReason?: InvalidBidReason,
        accumulatedValidationResults?: AccumulatedValidationResults<any>
    }
    hasFinished?: true;
}


// CORE FUNCTIONS -----------------------------------------------------------------------------------------------

export class ActionReactionLogger {
    private _actionAndReactions: ActionAndReactions = {};
    constructor() {}

    public __logInvalidBidReason(invalidBidReason: InvalidBidReason) {
        this._actionAndReactions.invalidActionInfo = {invalidBidReason};
    }

    public __logInvalidPayload(accumulatedValidationResults: AccumulatedValidationResults<any>) {
        this._actionAndReactions.invalidActionInfo = {accumulatedValidationResults};
    }

    public __logFlowReaction(flowPath: string[], type: FlowReactionType, details: FlowReactionDetails) {
        if(this._actionAndReactions.reactions === undefined) {
            this._actionAndReactions.reactions = [];
        }
        this._actionAndReactions.reactions.push({flowPath, type, details});
    }

    public __onActionProcessed(action: Action<any> & {id: number}): void {
        if(action.type === 'requestedAsync') {
            const {payload, ...a} = action;
            this._actionAndReactions.action = {...a}; // remove the payload from the action, because it is not serializable
        }
        else {
            this._actionAndReactions.action = {...action};
        }
    }

    public getActionAndReactions(): ActionAndReactions {
        const result: ActionAndReactions = {
            action: this._actionAndReactions.action,
            reactions: this._actionAndReactions.reactions ? [...this._actionAndReactions.reactions] : undefined,
        }
        if(this._actionAndReactions.invalidActionInfo) {
            result.invalidActionInfo = {...this._actionAndReactions.invalidActionInfo};
        }
        this._actionAndReactions = {};
        return result;
    }
}