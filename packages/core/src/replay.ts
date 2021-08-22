import { RequestedAction, UIAction} from "./index";
import { AnyActionWithId } from "./action";
import { sameNameKeyId } from "./name-key-map";
import { UIActionCheck } from "./validation";

export type ReplayFinishedCB = () => void;
export interface PayloadOverride {
    usePayload: boolean;
    payload: unknown;
}
export interface AbortReplayInfo {
    error: string;
    action: AnyActionWithId;
}

export type ReplayState = 'running' | "aborted" | "completed";
export type ReplayAction = AnyActionWithId & { testCb?: (payload: unknown) => void }

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

    public abortReplay(action: AnyActionWithId, error: string): void {
        this._abortInfo = {
            action: action,
            error: error
        };
        this._state = 'aborted';
    }

    public getNextReplayAction(actionId: number, isValidUIAction: (action: UIAction) => UIActionCheck, requestAction? :RequestedAction): AnyActionWithId | undefined {
        if(this._state !== 'running') return undefined;
        if(actionId > this._lastActionId) {
            this._state = 'completed';
            return undefined;
        }
        if(this._actions.has(actionId) === false) return undefined;
        const replayAction = this._actions.get(actionId)!;
        if(replayAction === undefined) return undefined;
        // UI ACTION
        if(replayAction.type === 'uiAction') {
            const uiActionCheck = isValidUIAction(replayAction);
            if(uiActionCheck !== UIActionCheck.OK) {
                this.abortReplay(replayAction, uiActionCheck);
                return undefined;
            }
        }
        // REQUESTED ACTION
        else if(replayAction.type === "requestedAction") {
            if(requestAction === undefined) {
                this.abortReplay(replayAction, `invalid request. Was this action requested by scenario '${replayAction.bThreadId}'?. or is it blocked by another scenario?`);
                return undefined
            }
            if(!sameNameKeyId(requestAction.bThreadId, replayAction.bThreadId) || !sameNameKeyId(requestAction.eventId, replayAction.eventId)) {
                this.abortReplay(replayAction, `the replay action and the requested action ${replayAction.eventId.name} do not match.`);
                return undefined;
            }
            if(replayAction.resolveActionId && replayAction.resolveActionId !== 'pending') {
                const resolveAction = this._actions.get(replayAction.resolveActionId);
                if(resolveAction === undefined) {
                    this.abortReplay(replayAction, `a resolve action with id '${replayAction.resolveActionId}' is expected, but no resolve action was found.`);
                    return undefined;
                }
                replayAction.payload = new Promise(() => null); // a promise that will never resolve
            } else if(Object.prototype.hasOwnProperty.call(replayAction, "payload") === false) {
                replayAction.payload = requestAction.payload;
            }
        }
        //TODO: is a test needed for 'rejectAction', 'resolveAction', resolvedExtendAction' ?? It is checked if the reaction is correct...
        replayAction.testCb?.(replayAction.payload);
        return replayAction;
    }
}
