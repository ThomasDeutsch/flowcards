import { AnyAction, getNextRequestedAction } from "./action";
import { GetEvent } from "./scheduler";
import { Logger } from "./logger";
import { isSameNameKeyId } from "./name-key-map";
import { Staging } from "./staging";
import { explainAskFor, ExplainEventResult, explainExtend, explainRequest, explainTrigger, isActionFromBid } from ".";


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
export type ReplayAction = AnyAction & { testCb?: (payload: unknown) => void }


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
    private _actions: Map<number, ReplayAction> = new Map();
    private _lastActionId: number;

    constructor(actions: ReplayAction[]) {
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

    public getNextReplayAction(getEvent: GetEvent, staging: Staging, nextActionId: number, logger: Logger): AnyAction | undefined {
        if(this._state !== 'running') return undefined;
        if(nextActionId > this._lastActionId) {
            this._state = 'completed';
            return undefined;
        }
        const replayAction = this._actions.get(nextActionId)!;
        const payloadOverride = 'payload' in replayAction ? {value: replayAction.payload} : undefined;
        if(replayAction === undefined) return undefined;

        const bid = staging.getFlow(replayAction.flowId)?.getBid(replayAction.bidId);
        if(bid === undefined) {
            this.abortReplay(replayAction, `no bid for this action: '${replayAction}'`);
            return undefined;
        }

        if(isActionFromBid(replayAction)) {
            const expectedAction = getNextRequestedAction(getEvent, staging, nextActionId, logger, payloadOverride);
            if(expectedAction === undefined) {
                this.abortReplay(replayAction, `action was not requested!`);
                return undefined;
            }
            // check if the requested action matches the replay-action
            if(expectedAction.bidId !== replayAction.bidId || !isSameNameKeyId(expectedAction.flowId, replayAction.flowId)) {
                this.abortReplay(replayAction, `action not expected: '${replayAction.bidId}, ${replayAction.flowId.name}', expected: '${expectedAction!.bidId}, ${expectedAction!.flowId.name}'`);
                return undefined;
            }
            // do not make the async call again - use the resolved value if there is one.
            if(replayAction.type === 'requestedAsyncAction' && replayAction.resolveActionId) {
                const resolveAction = this._actions.get(replayAction.resolveActionId);
                if(resolveAction === undefined) {
                    this.abortReplay(replayAction, `a resolve action with id '${replayAction.resolveActionId}' is expected, but no resolve action was found.`);
                    return undefined;
                }
                replayAction.payload = new Promise(() => null); // a promise that will never resolve
            }
        }
        // check guards!
        const event = getEvent(replayAction.eventId);
        if(event === undefined) {
            this.abortReplay(replayAction, `event not found: ${replayAction.eventId}`);
            return undefined;
        }
        let explain: ExplainEventResult<any> | undefined = undefined;
        if(bid.type === 'requestBid') {
            explain = explainRequest(event, bid);
        }
        else if(bid.type === 'triggerBid') {
            explain = explainTrigger(event, bid);
        }
        else if(bid.type === 'askForBid') {
            explain = explainAskFor(event, replayAction.payload);
        }
        else if(bid.type === 'extendBid') {
            explain = explainExtend(event, bid, replayAction);
        }
        if(explain && !explain.isValid) {
            this.abortReplay(replayAction, `invalid action: ${replayAction}, explain: ${explain?.failed.join(',')}`);
            return undefined;
        }
        replayAction.testCb?.(replayAction.payload);
        return replayAction;
    }
}
