import { AnyAction } from "./action";
import { EventMap } from "./update-loop";
import { AllPlacedBids } from "./bid";
import { Logger } from "./logger";
import { isSameNameKeyId } from "./name-key-map";
import { getNextRequestedAction } from ".";


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

export class Replay {
    public title = "";
    private _state: ReplayState = 'running' ;
    public get state(): ReplayState { return this._state }
    private _abortInfo?: AbortReplayInfo;
    public get abortInfo(): AbortReplayInfo | undefined { return this._abortInfo }
    private _actions: Map<number, ReplayAction> = new Map();
    private _lastActionId: number;

    constructor(actions: ReplayAction[]) {
        actions.forEach(action => this._actions.set(action.id, action));
        this._lastActionId = actions[actions.length-1]?.id || 0;
    }

    public abortReplay(action: AnyAction, error: string): void {
        this._abortInfo = {
            action: action,
            error: error
        };
        this._state = 'aborted';
    }

    public getNextReplayAction(eventMap: EventMap, allPlacedBids: AllPlacedBids, nextActionId: number, logger: Logger): AnyAction | undefined {
        if(this._state !== 'running') return undefined;
        const requestAction = getNextRequestedAction(eventMap, allPlacedBids, nextActionId, logger);
        if(nextActionId > this._lastActionId) {
            this._state = 'completed';
            return undefined;
        }
        const replayAction = this._actions.get(nextActionId)!;
        if(replayAction === undefined) return undefined;
        // UI ACTION
        if(replayAction.type === 'uiAction') {
            //TODO: instead of isValidPayload, use validateAskFor!! (validateAll)
            const isValidPayload = eventMap.get(replayAction.eventId)?.isValid(replayAction.payload);
            if(!isValidPayload) {
                this.abortReplay(replayAction, 'event can not be dispatched');
                return undefined;
            }
        }
        // REQUESTED ACTION
        else if(replayAction.type === "requestedAction") {
            if(requestAction === undefined) {
                this.abortReplay(replayAction, `invalid request. Was this action requested by scenario '${replayAction.bThreadId}'?. or is it blocked by another scenario?`);
                return undefined
            }
            if(!isSameNameKeyId(requestAction.bThreadId, replayAction.bThreadId) || !isSameNameKeyId(requestAction.eventId, replayAction.eventId)) {
                this.abortReplay(replayAction, `the replay action and the requested action ${replayAction.eventId.name} do not match.`);
                return undefined;
            }
        }
        else if(replayAction.type === 'requestedAsyncAction' && replayAction.resolveActionId) {
            const resolveAction = this._actions.get(replayAction.resolveActionId);
            if(resolveAction === undefined) {
                this.abortReplay(replayAction, `a resolve action with id '${replayAction.resolveActionId}' is expected, but no resolve action was found.`);
                return undefined;
            }
            replayAction.payload = new Promise(() => null); // a promise that will never resolve
        }
        // else if(Object.prototype.hasOwnProperty.call(replayAction, "payload") === false) {
        //     replayAction.payload = requestAction.payload;
        // }
        //TODO: is a test needed for 'rejectAction', 'resolveAction', resolvedExtendAction' ?? It is checked if the reaction is correct...
        replayAction.testCb?.(replayAction.payload);
        return replayAction;
    }
}
