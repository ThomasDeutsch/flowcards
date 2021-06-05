import { ResolveAction, ResolveExtendAction, UIAction } from './action';
import { ScenariosContext, UpdateLoop } from './update-loop';
import { StagingFunction } from './scaffolding';
import { Logger } from './logger';
import { Replay } from './replay';

export * from './scenario';
export * from './bthread';
export * from './update-loop';
export * from './event-cache';
export * from './event-map';
export * from "./bid";
export * from "./scaffolding";
export * from './event-map';
export * from './logger';
export * from './action';
export * from './extend-context';

export type UpdateCallback = (newContext: ScenariosContext) => void;
export type InternalDispatch = (action: UIAction | ResolveAction | ResolveExtendAction) => void;
export type ContextTestResult = {isValid: boolean, details: unknown};
export type ContextTest = (context: ScenariosContext) => ContextTestResult | void;
export type StartReplay = (replay: Replay) => void;

export class Scenarios {
    private _bufferedActions: (UIAction | ResolveAction | ResolveExtendAction)[] = [];
    private _updateLoop: UpdateLoop;
    private _updateCb?: UpdateCallback;
    public initialScenariosContext: ScenariosContext;
    private _logger: Logger;

    constructor(stagingFunction: StagingFunction, updateCb?: UpdateCallback, doInitialUpdate = false) {
        this._logger = new Logger();
        this._updateLoop = new UpdateLoop(stagingFunction, this._internalDispatch.bind(this), this._logger);
        this.initialScenariosContext = this._updateLoop.runScaffolding();
        this._updateCb = updateCb;
        if(updateCb && doInitialUpdate) updateCb(this.initialScenariosContext); // callback with initial value
    }

    private _internalDispatch(action: UIAction | ResolveAction | ResolveExtendAction) {
        this._bufferedActions.push(action);
        this._clearBufferOnNextTick();
    }

    private _clearBufferOnNextTick(): void {
        Promise.resolve().then(() => { // next tick
            if(this._bufferedActions.length === 0) return
            this._updateLoop.setActionQueue(this._bufferedActions);
            this._bufferedActions.length = 0;
            const context = this._updateLoop.runScaffolding();
            this._updateCb?.(context);
        }).catch(e => console.error(e));
    }

    public startReplay(replay: Replay): void {
        if(!this._updateCb) return;
        replay.start(this._updateLoop, this._updateCb);
    }
}
