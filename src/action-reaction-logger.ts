import { LoggedAction } from "./action.ts";
import { FlowReaction, FlowReactionDetails, FlowReactionType } from "./flow-reaction.ts";
import { Action, ExternalAction } from "./index.ts";

/**
 * action and reactions that are logged by the flows
 */
 export interface ActionAndReactions {
    action?: LoggedAction<any>,
    reactions?: FlowReaction[]
}

/**
 * action and reactions that are logged by the flows, used for testing.
 * 
 */
export interface ActionAndReactionsTest {
    action?: LoggedAction<any>,
    reactions?: FlowReaction[],
    test?: (payload: any) => void
}

/**
 * @internal
 * the action/reaction log is used to collect information about all scheduler runs - until no more action is processed.
 * it is used to collect information about:
 *  3. based on a valid action, reactions from the flows are collected
 *  4. the finished processed action is logged (all flows have reacted to the action)
 */
export class ActionReactionLogger {
    private _actionAndReactions: ActionAndReactions = {};
    constructor() {}

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
     * logs the processed action to the current scheduler run.
     * @param action the processed action
     */
    public onActionProcessed(action: Action<any> & {id: number}): void {
        if(action.type === 'requestedAsync') {
            this._actionAndReactions.action = {...action, payload: undefined};
        }
        else {
            this._actionAndReactions.action = {...action};
        }
    }


    /**
     * @internal
     * the log of all scheduler runs
     * @returns all actions and reactions until the scheduler finished processing actions
     * @internalRemarks this is used by the scheduler to get the latest log for the latest scheduler run(s)
     */
    public getActionsAndReactions(): ActionAndReactions {
        const reactions = this._actionAndReactions.reactions ? [...this._actionAndReactions.reactions] : undefined;
        const result = {...this._actionAndReactions, reactions} as ActionAndReactions;
        this._actionAndReactions = {};
        return result;
    }
}