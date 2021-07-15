import { BidType, BThreadId, PlacedBid, RequestedAction} from "./index";
import { AnyActionWithId } from "./action";
import { EventId } from "./event-map";
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
type GetBidFn = (bThreadId: BThreadId, bidType: BidType, eventId: EventId) => PlacedBid | undefined;


export enum ReplayActionCheck {
    OK = 'OK',
    ActionIdNotPartOfReplay = 'ActionIdNotPartOfReplay',
    ActionTypesNotMatching = 'ActionTypesNotMatching',
    EventNameNotMatching = 'EventNameNotMatching',
    EventKeyNotMatching = 'EventKeyNotMatching',
    BidTypesNotMatching = 'BidTypesNotMatching',
    ResolvedBidNotMatching = 'ResolvedBidNotMatching',
    ExtendedBidNotMatching = 'ExtendedBidNotMatching',
    ExtendingScenarioNotMatching = 'ExtendingScenarioNotMatching',
    ActionNotExpected = 'ActionNotExpected',
    RequestedByWrongScenario = 'RequestedByWrongScenario'
}


function getResult(action: AnyActionWithId, replayAction?: AnyActionWithId): ReplayActionCheck {
    if(!replayAction) return ReplayActionCheck.ActionIdNotPartOfReplay;
    if(replayAction.type !== action.type) return ReplayActionCheck.ActionTypesNotMatching;
    if(replayAction.eventId.name !== action.eventId.name) return ReplayActionCheck.EventNameNotMatching;
    if(replayAction.eventId.key !== action.eventId.key) return ReplayActionCheck.EventKeyNotMatching;
    if(action.type === 'requestedAction') {
        const ra = replayAction as RequestedAction;
        if(action.bThreadId !== ra.bThreadId) return ReplayActionCheck.RequestedByWrongScenario;
        if(action.bidType !== ra.bidType) return ReplayActionCheck.BidTypesNotMatching;
    }
    if(action.type === 'rejectAction' || action.type === 'resolveAction') {
        const ra = replayAction as any;
        if(action.resolvedRequestingBid !== ra.resolvedRequestingBid) return ReplayActionCheck.ResolvedBidNotMatching;
    }
    if(action.type === 'resolvedExtendAction') {
        const ra = replayAction as any;
        if(action.extendedRequestingBid !== ra.extendedRequestingBid) return ReplayActionCheck.ExtendedBidNotMatching;
        if(action.extendingBThreadId !== ra.extendingBThreadId) return ReplayActionCheck.ExtendingScenarioNotMatching;
    }
    return ReplayActionCheck.OK;
}

export class Replay {
    public title = "";
    private _state: ReplayState = 'running' ;
    public get state(): ReplayState { return this._state }
    private _abortInfo?: AbortReplayInfo;
    public get abortInfo(): AbortReplayInfo | undefined { return this._abortInfo }
    private _actions: Map<number, AnyActionWithId> = new Map();
    private _lastActionId: number;

    constructor(actions: AnyActionWithId[]) {
        actions.forEach(action => this._actions.set(action.id, action));
        this._lastActionId = actions[actions.length-1].id;
    }

    public abortReplayOnInvalidReaction(action: AnyActionWithId, failedCheck: string): void {
        this._abortInfo = {
            action: action,
            error: failedCheck
        };
        this._state = 'aborted';
    }

    public abortReplayOnInvalidAction(action: AnyActionWithId, uiActionCheck?: UIActionCheck): void {
        let result = 'OK';
        if(uiActionCheck && uiActionCheck !== UIActionCheck.OK) {
            result = uiActionCheck;
        } else {
            const replayAction = this._actions.get(action.id);
            result = getResult(action, replayAction);
        }
        if(result !== 'OK') {
            this._abortInfo = {
                action: action,
                error: result
            };
            this._state = 'aborted';
        }
    }

    public getNextReplayAction(getBid :GetBidFn, actionId: number): AnyActionWithId | undefined {
        if(this._state !== 'running') return undefined;
        if(this._actions.has(actionId)) {
            const action = this._actions.get(actionId)!;
            if(action.type === "requestedAction" && !Object.keys(action).some((p) => p === 'payload')) {
                action.payload = getBid(action.bThreadId, action.bidType, action.eventId)?.payload;
            }
            else if(action.type === "requestedAction" && action.resolveActionId) {
                action.payload = new Promise(() => null); // a promise that will never resolve
            }
            return action;
        }
        return undefined;
    }

    public checkIfCompleted(action: AnyActionWithId): void {
        if(this._state !== 'running') return;
        if(this._lastActionId === action.id) {
            this._state = 'completed';
        }
    }
}
