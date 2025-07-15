import { LoggedAction } from "./action.ts";
import { InvalidBidReason } from "./bid-invalid-reasons.ts";
import { RuleReaction, RuleReactionDetails, RuleReactionType } from "./rule-reactions.ts";
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
    reactions?: RuleReaction[],
    tests?: {[key:string]: (engine: Engine) => void},
    // DEBUG:
    invalidActionInfo?: {
        invalidBidReason?: InvalidBidReason,
        accumulatedValidationResults?: AccumulatedValidationResults<any>
    }
    hasFinished?: true;
    actionRejected?: boolean;
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

    public __logRuleReaction(rulePath: string[], type: RuleReactionType, details: RuleReactionDetails) {
        if(this._actionAndReactions.reactions === undefined) {
            this._actionAndReactions.reactions = [];
        }
        this._actionAndReactions.reactions.push({rulePath, type, details});
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