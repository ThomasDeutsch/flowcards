import { BidType, BThreadId, PlacedBid} from "./index";
import { AnyActionWithId, GET_VALUE_FROM_BTHREAD } from "./action";
import { EventId } from "./event-map";

export type ReplayFinishedCB = () => void;
export interface PayloadOverride {
    usePayload: boolean;
    payload: unknown;
}

export type ReplayState = 'running' | "aborted" | "completed";
type GetBidFn = (bThreadId: BThreadId, bidType: BidType, eventId: EventId) => PlacedBid | undefined;
export interface ReplayStatus {
    state: ReplayState;
    abortMessage: string;
}

export class Replay {
    private _actions: AnyActionWithId[] = [];
    private _state: ReplayState = 'running' ;
    public get state(): ReplayState { return this._state }
    private _abortMessage = "";
    public get abortMessage(): string { return this._abortMessage }

    constructor(actions: AnyActionWithId[]) {
        this._actions = [...actions];
    }

    public completeSuccessfulRun(): boolean {
        if(this._state === 'running' && this._actions?.length === 0) {
            this._state = 'completed';
            return true;
        }
        return false;
    }

    public abortRun(failedCheck: string): void {
        this._abortMessage = failedCheck;
        this._state = 'aborted';
    }

    public getNextReplayAction(getBid :GetBidFn, actionId: number): AnyActionWithId | undefined {
        if(this._state !== 'running') return undefined;
        if(this._actions.length > 0 && this._actions[0].id === actionId) {
            const action = this._actions.shift()!;
            if(action.type === "requestedAction" && action.payload === GET_VALUE_FROM_BTHREAD) {
                action.payload = getBid(action.bThreadId, action.bidType, action.eventId)?.payload;
            }
            else if(action.type === "requestedAction" && action.resolveActionId) {
                action.payload = new Promise(() => null); // a promise that will never resolve
            }
            return action;
        }
        return undefined;
    }

    public getReplayStatus(): ReplayStatus {
        return {
            state: this.state,
            abortMessage: this.abortMessage
        }
    }
}