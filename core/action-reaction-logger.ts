import { LoggedAction } from "./action.ts";
import { InvalidBidReason } from "./bid-invalid-reasons.ts";
import { FlowReaction, FlowReactionDetails, FlowReactionType } from "./flow-reaction.ts";
import { AccumulatedValidationResults, Action, Engine } from "./index.ts";

/**
 * action and reactions that are logged by the flows
 */
 export interface ActionAndReactions {
    action?: LoggedAction<any>,
    reactions?: FlowReaction[],
    // Debug-Mode Information
    tests?: ((engine: Engine) => void)[],
    invalidActionInfo?: {
        invalidBidReason?: InvalidBidReason,
        accumulatedValidationResults?: AccumulatedValidationResults<any>
    }
}

/**
 * @internal
 * the action/reaction log is used to collect information about all engine runs - until no more action is processed.
 * it is used to collect information about:
 *  3. based on a valid action, reactions from the flows are collected
 *  4. the finished processed action is logged (all flows have reacted to the action)
 */
export class ActionReactionLogger {
    private _actionAndReactions: ActionAndReactions = {};
    constructor() {}

    /**
     * @internal
     * log invalid action information, because of an invalid bid
     */
    public __logInvalidBidReason(invalidBidReason: InvalidBidReason) {
        this._actionAndReactions.invalidActionInfo = {invalidBidReason};
    }

    /**
     * @internal
     * log invalid action information, because of an invalid payload
     */
    public __logInvalidPayload(accumulatedValidationResults: AccumulatedValidationResults<any>) {
        this._actionAndReactions.invalidActionInfo = {accumulatedValidationResults};
    }

    /**
     * @internal
     * log a reaction of a flow to an action
     * @param flowId  the id of the flow
     * @param reactionType  the type of the reaction
     */
    public __logFlowReaction(flowPath: string[], type: FlowReactionType, details: FlowReactionDetails) {
        if(this._actionAndReactions.reactions === undefined) {
            this._actionAndReactions.reactions = [];
        }
        this._actionAndReactions.reactions.push({flowPath, type, details});
    }

    /**
     * @internal
     * logs the processed action to the current engine run.
     * @param action the processed action
     */
    public __onActionProcessed(action: Action<any> & {id: number}): void {
        if(action.type === 'requestedAsync') {
            const {payload, ...a} = action;
            this._actionAndReactions.action = {...a}; // remove the payload from the action, because it is not serializable
        }
        else {
            this._actionAndReactions.action = {...action};
        }
    }


    /**
     * @internal
     * the log of an action and all reactions to this action
     */
    public getActionAndReactions(): ActionAndReactions | 'noActionReactionsRecorded' {
        const result: ActionAndReactions = {
            action: this._actionAndReactions.action,
            reactions: this._actionAndReactions.reactions ? [...this._actionAndReactions.reactions] : undefined
        }
        this._actionAndReactions = {};
        if(!result.reactions?.length && !result.action) {
            return 'noActionReactionsRecorded';
        }
        return result;
    }
}