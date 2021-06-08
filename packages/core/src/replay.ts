import { ContextTest, UpdateCallback, UpdateLoop } from "./index";
import { AnyActionWithId, GET_VALUE_FROM_BTHREAD } from "./action";

export type ReplayFinishedCB = () => void;
export interface PayloadOverride {
    usePayload: boolean;
    payload: unknown;
}
export interface SerializedReplay {
    actions: AnyActionWithId[];
    title?: string;
    breakBefore?: number[];
    payloadOverride?: Record<number, PayloadOverride>;
}
export class Replay {
    private _updateLoop?: UpdateLoop;
    private _updateCb?: UpdateCallback;
    private _actions: AnyActionWithId[] = [];
    private _breakBefore = new Map<number, boolean>();
    private _payloadOverride: Record<number, PayloadOverride> = {};
    private _remainingReplayActions?: AnyActionWithId[];
    private _tests?: Record<number, ContextTest[]> = {};
    private _isPaused = false;
    public title = "";
    private _replayFinishedCB?: ReplayFinishedCB;
    private _isCompleted = false;
    public get isCompleted(): boolean { return this._isCompleted}

    constructor(serializedReplay: SerializedReplay, replayFinishedCB?: ReplayFinishedCB) {
        this.title = serializedReplay.title || "";
        this._actions = [...serializedReplay.actions];
        this._breakBefore = new Map();
        serializedReplay.breakBefore?.forEach(actionId => {
            this._breakBefore.set(actionId, false);
        })
        this._payloadOverride = {...serializedReplay.payloadOverride};
        this._replayFinishedCB = replayFinishedCB
    }

    public enablePayloadOverride(actionId: number, payload: unknown): void {
        this._payloadOverride[actionId] = { usePayload: true, payload: payload };
    }
    public disablePayloadOverride(actionId: number): void {
        this._payloadOverride[actionId].usePayload = false;
    }
    public toggleBreakBefore(actionId: number): void {
        this._breakBefore.get(actionId) === false ? this._breakBefore.set(actionId, true) : this._breakBefore.set(actionId, false);
    }
    public loadActions(actions: AnyActionWithId[]): void {
        this._actions = [...actions];
    }

    public getRemainingActions(): AnyActionWithId[] {
        return this._remainingReplayActions || [];
    }

    public get isRunning(): boolean {
        return this._remainingReplayActions?.length !== 0;
    }

    public get isPaused(): boolean {
        return this._isPaused;
    }

    public pauseOnBreakpoint(actionId: number): boolean {
        if(this._breakBefore.get(actionId) === false) {
            this._breakBefore.set(actionId, true);
            this.pause();
            return true;
        }
        return false;
    }

    public pause(): void {
        this._isPaused = true;
    }

    public resume(): void {
        if(this.isCompleted) return;
        this._isPaused = false;
        this._updateCb!(this._updateLoop!.runScaffolding());
    }

    public start(updateLoop: UpdateLoop, updateCb: UpdateCallback): void {
        this._isCompleted = false;
        this._updateLoop = updateLoop;
        this._updateCb = updateCb;
        this._remainingReplayActions = [...this._actions];
        this._updateCb(this._updateLoop.startReplay(this));
    }

    public runCompleted(): boolean {
        if(this._remainingReplayActions?.length === 0) {
            this._isCompleted = true;
            this._remainingReplayActions = undefined;
            Promise.resolve().then(() => { // call CB on next tick, because then a new ScenariosContext will be ready.
                this._replayFinishedCB?.();
            });
            return true;
        }
        return false;
    }

    public getNextReplayAction(actionId: number): AnyActionWithId | undefined {
        if(this.isCompleted) return undefined;
        if(!this._updateLoop || this._remainingReplayActions === undefined) return undefined;
        if(this._remainingReplayActions.length > 0 && this._remainingReplayActions[0].id === actionId) {
            const action = this._remainingReplayActions.shift()!;
            const payloadOverride = this._payloadOverride[actionId];
            if(payloadOverride?.usePayload) action.payload = payloadOverride.payload;
            if(action.type === "requestedAction" && action.payload === GET_VALUE_FROM_BTHREAD) {
                action.payload = this._updateLoop.getBid(action.bThreadId, action.bidType, action.eventId)?.payload;
            }
            else if(action.type === "requestedAction" && action.resolveActionId) {
                action.payload = new Promise(() => null); // a promise that will never resolve
            }
            return action;
        }
        return undefined;
    }
}
