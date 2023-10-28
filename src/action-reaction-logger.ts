import { LoggedAction } from "./action.ts";
import { FlowReaction, FlowReactionDetails, FlowReactionType } from "./flow-reaction.ts";
import { Action, Engine } from "./index.ts";

/**
 * action and reactions that are logged by the flows
 */
 export interface ActionAndReactions {
    action?: LoggedAction<any>,
    reactions?: FlowReaction[],
    // Debug-Mode Information
    tests?: ((engine: Engine) => void)[],
    overruledBids?: [] // Trigger, Extends, Requests, AskFors that were overruled by a higher priority bid
    invalidRequests?: [] // Requests that are invalid, warning: do not save the whole bid!
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
            this._actionAndReactions.action = a; // remove the payload from the action, because it is not serializable
        }
        else {
            this._actionAndReactions.action = {...action};
        }
    }


    /**
     * @internal
     * the log of all engine runs
     * @returns all actions and reactions until the engine finished processing actions
     * @internalRemarks this is used by the engine to get the latest log for the latest engine run(s)
     */
    public getActionAndReactions(): ActionAndReactions | undefined {
        const result = {
            action: this._actionAndReactions.action,
            reactions: this._actionAndReactions.reactions ? [...this._actionAndReactions.reactions] : undefined
        }
        this._actionAndReactions = {};
        if(!result.reactions?.length && !result.action) {
            return undefined;
        }
        return result;
    }
}