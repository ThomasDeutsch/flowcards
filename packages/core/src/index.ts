import { AnyActionWithId, ResolveAction, ResolveExtendAction, UIAction } from './action';
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
export * from './replay';

export type UpdateCallback = (newContext: ScenariosContext) => void;
export type InternalDispatch = (action: UIAction | ResolveAction | ResolveExtendAction) => void;

export class Scenarios {
    private _bufferedActions: (UIAction | ResolveAction | ResolveExtendAction)[] = [];
    private _updateLoop: UpdateLoop;
    private _updateCb?: UpdateCallback;
    public initialScenariosContext: ScenariosContext;
    private _logger: Logger;

    constructor(stagingFunction: StagingFunction, updateCb?: UpdateCallback, doInitialUpdate = false, initialActionsOrReplay?: AnyActionWithId[] | Replay) {
        this._logger = new Logger();
        this._updateLoop = new UpdateLoop(stagingFunction, this._internalDispatch.bind(this), this._logger);
        let replay: Replay | undefined;
            if(Array.isArray(initialActionsOrReplay)) replay = new Replay(initialActionsOrReplay);
            else if (initialActionsOrReplay instanceof Replay) replay = initialActionsOrReplay;
        this.initialScenariosContext = this._updateLoop.runScaffolding(replay);
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

    public reset(initialActionsOrReplay?: AnyActionWithId[] | Replay): void {
        this._bufferedActions.length = 0;
        const replay = Array.isArray(initialActionsOrReplay) ? new Replay(initialActionsOrReplay) : initialActionsOrReplay
        this._updateLoop.reset();
        const context = this._updateLoop.runScaffolding(replay);
        this._updateCb?.(context);
    }

    public onDepsChanged(): void {
        const context = this._updateLoop.runScaffolding();
        this._updateCb?.(context);
        // TODO: make dependency-change replayable!
    }
}
