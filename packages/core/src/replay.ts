import { ContextTest, UpdateCallback, UpdateLoop } from "./index";
import { AnyActionWithId, GET_VALUE_FROM_BTHREAD } from "./action";

export class Replay {
    private _actions: AnyActionWithId[] = [];
    private _currentReplay: AnyActionWithId[] = [];
    private _breakBefore = new Set<number>();
    private _tests?: Record<number, ContextTest[]> = {};
    private _payloadOverride: Record<number, { usePayload: boolean, payload: unknown }> = {};
    private _isPaused = false;
    private _updateLoop?: UpdateLoop;
    private _updateCb?: UpdateCallback

    public enablePayloadOverride(actionId: number, payload: unknown): void {
        this._payloadOverride[actionId] = { usePayload: true, payload: payload };
    }
    public disablePayloadOverride(actionId: number): void {
        this._payloadOverride[actionId].usePayload = false;
    }
    public toggleBreakBefore(actionId: number): void {
        this._breakBefore.has(actionId) ? this._breakBefore.delete(actionId) : this._breakBefore.add(actionId);
    }
    public loadActions(actions: AnyActionWithId[]): void {
        this._actions = [...actions];
    }

    public get isRunning(): boolean {
        return this._currentReplay.length > 0;
    }

    // public runContextTests(): void {
    //     const tests = this._tests[this._currentActionId];
    //     if(tests === undefined || tests.length === 0) return;
    //     const results: ContextTestResult[] = [];
    //     tests.forEach(scenarioTest => {
    //         try {
    //             const result = scenarioTest(this._getContext());
    //             if(result) results.push(result);
    //         } catch(error) {
    //             this._replay!.isPaused = true;
    //             results.push({isValid: false, details: error});
    //             throw(error);
    //         }
    //     });
    //     if(results) {
    //         if(!this._testResults) this._testResults = {};
    //         this._testResults[this._currentActionId] = results;
    //     }
    // }

    public get isPaused(): boolean {
        return this._isPaused;
    }

    public pauseOnBreakpoint(actionId: number): void {
        if(this._breakBefore.has(actionId)) {
            this.pause();
        }
    }

    public pause(): void {
        this._isPaused = true;
    }

    public resume(): void {
        this._isPaused = false;
        this._updateCb!(this._updateLoop!.runScaffolding());
    }

    public start(updateLoop: UpdateLoop, updateCb: UpdateCallback): void {
        this._updateLoop = updateLoop;
        this._updateCb = updateCb;
        this._currentReplay = [...this._actions];
        this._updateCb(this._updateLoop.startReplay(this));
    }

    public getNextReplayAction(actionId: number): AnyActionWithId | undefined {
        if(!this._updateLoop) return undefined;
        if(this._currentReplay.length > 0 && this._currentReplay[0].id === actionId) {
            const action = this._currentReplay.shift()!;
            if(action.type === "requestedAction" && action.payload === GET_VALUE_FROM_BTHREAD) {
                action.payload = this._updateLoop.getBid(action.bThreadId, action.bidType, action.eventId)?.payload;
            }
            return action;
        }
        return undefined;
    }
}
