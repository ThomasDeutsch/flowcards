import { AnyAction } from "./action";
import { Logger } from "./logger";
import { Staging } from "./staging";
import { explainAskFor, explainRequest, explainResolve, explainTrigger, getInitialExplainResult, isActionFromBid, PlacedRequestBid, PlacedTriggerBid } from ".";
import { isThenable } from "./utils";


export type ReplayFinishedCB = () => void;
export interface PayloadOverride {
    usePayload: boolean;
    payload: unknown;
}
export interface AbortReplayInfo {
    error: string;
    action: AnyAction;
}

export type ReplayState = 'running' | "aborted" | "completed";


export function getReplay(initialActionsOrReplay?: AnyAction[] | Replay): Replay | undefined {
    if(initialActionsOrReplay === undefined)  {
        return undefined;
    }
    else if(Array.isArray(initialActionsOrReplay) ) {
        if(initialActionsOrReplay.length > 0) {
            return new Replay(initialActionsOrReplay);
        }
        return undefined;
    }
    return initialActionsOrReplay;
}

export class Replay {
    public title = "";
    private _state: ReplayState = 'running';
    public get state(): ReplayState { return this._state }
    private _abortInfo?: AbortReplayInfo;
    public get abortInfo(): AbortReplayInfo | undefined { return this._abortInfo }
    private _actions: Map<number, AnyAction> = new Map();
    private _lastActionId: number;

    constructor(actions: AnyAction[]) {
        actions.forEach(action => this._actions.set(action.id!, action));
        this._lastActionId = actions[actions.length-1]?.id || 0;
    }

    public abortReplay(action: AnyAction, error: string): void {
        this._abortInfo = {
            action: action,
            error: error
        };
        this._state = 'aborted';
    }

    public getNextReplayAction(staging: Staging, nextActionId: number, logger: Logger): AnyAction | undefined {
        if(this._state !== 'running') return undefined;
        if(nextActionId > this._lastActionId) {
            this._state = 'completed';
            return undefined;
        }
        const replayAction = this._actions.get(nextActionId);
        if(replayAction === undefined) return undefined;

        const flow = staging.getFlow(replayAction.flowId)
        if(flow === undefined) {
            this.abortReplay(replayAction, `flow for this action is not enabled`);
            return undefined;
        }

        const event = staging.getEvent(replayAction.eventId);
        if(event === undefined) {
            this.abortReplay(replayAction, `event not found: ${replayAction.eventId}`);
            return undefined;
        }

        if(replayAction.type === 'requestedAsyncAction') {
            const bid = flow.getBid(replayAction.bidId);
            if(bid === undefined) {
                this.abortReplay(replayAction, `flow has not placed a bid for this action`);
                return undefined;
            }
            // check if the event is valid
            const result = getInitialExplainResult(event);
            if(!result.isValid) {
                this.abortReplay(replayAction, `event is not valid`);
                return undefined;
            }
            // do not make the async call again - use the resolved value if there is one.
            if(replayAction.resolveActionId) {
                const resolveAction = this._actions.get(replayAction.resolveActionId);
                if(resolveAction === undefined) {
                    this.abortReplay(replayAction, `a resolve action with id '${replayAction.resolveActionId}' is expected, but no resolve action was found.`);
                    return undefined;
                }
                if(resolveAction && ("payload" in replayAction)) {
                    this.abortReplay(replayAction, `a payload for the requestedAsyncAction was provided, as well as a resolve-Action payload`);
                    return undefined;
                }
                if('payload' in (this._actions.get(replayAction.resolveActionId) || {})) {
                    return {...replayAction, payload: new Promise(() => null)};
                }
                return replayAction;

            }
            // use a different api-call
            else if("payload" in replayAction) {
                if(replayAction.payload instanceof Function) {
                    return {...replayAction, payload: replayAction.payload() }
                } else {
                    this.abortReplay(replayAction, `the payload for an requestedAsyncAction needs to be a function that returns a promise`);
                    return undefined;
                }
            }
            // make async-call again.
            const payloadFn = (bid as PlacedRequestBid<any, any>).payload;
            if(!(payloadFn instanceof Function)) {
                this.abortReplay(replayAction, `the payload of the requestig flow needs to be a function that returns a promise`);
                return undefined;
            }
            const promise = payloadFn();
            if(!isThenable(promise)) {
                this.abortReplay(replayAction, `the payload of the requestig flow needs to be a function that returns a promise`);
                return undefined;
            }
            return {...replayAction, payload: promise};
        }

        if(replayAction.type === 'requestedAction') {
            let bid = flow.getBid(replayAction.bidId) as PlacedRequestBid<any, any> | undefined;
            if(bid === undefined) {
                this.abortReplay(replayAction, `flow has not placed a bid for this action`);
                return undefined;
            }
            if("payload" in replayAction) {
                bid = {...bid, payload: replayAction.payload}
            } else {
                replayAction.payload = bid.payload;
            }
            const explain = explainRequest(event, bid as PlacedRequestBid<any, any> );
            if(!explain.isValid) {
                this.abortReplay(replayAction, explain.invalidReason);
                return undefined;
            }
            return replayAction;
        }

        if(replayAction.type === 'triggeredAction') {
            let bid = flow.getBid(replayAction.bidId) as PlacedTriggerBid<any, any> | undefined;
            if(bid === undefined) {
                this.abortReplay(replayAction, `flow has not placed a bid for this action`);
                return undefined;
            }
            if("payload" in replayAction) {
                bid = {...bid, payload: replayAction.payload}
            } else {
                replayAction.payload = bid.payload;
            }
            const explain = explainTrigger(event, bid as PlacedTriggerBid<any, any> );
            if(!explain.isValid) {
                this.abortReplay(replayAction, explain.invalidReason);
                return undefined;
            }
            return replayAction;
        }

        if(replayAction.type === 'uiAction') {
            const payloadOverride = "payload" in replayAction ? {value: replayAction.payload} : undefined;
            const explain = explainAskFor(event, payloadOverride ? payloadOverride.value : replayAction.payload);
            if(!explain.isValid) {
                this.abortReplay(replayAction, `invalidReason: ${explain?.invalidReason}`);
                return undefined;
            }
            return replayAction;
        }

        if(replayAction.type === 'rejectAction') {
            return replayAction;
        }

        if(replayAction.type === 'resolvedExtendAction') {
            const explain = getInitialExplainResult(event, 'extend');
            if(!explain.isValid) {
                this.abortReplay(replayAction, `invalidReason: ${explain?.invalidReason}`);
                return undefined;
            }
            return replayAction;
        }

        if(replayAction.type === 'resolveAction') {
            const explain = explainResolve(event, replayAction.payload);
            if(!explain.isValid) {
                this.abortReplay(replayAction, `invalidReason: ${explain?.invalidReason}`);
                return undefined;
            }
            return replayAction;
        }



    }
}
