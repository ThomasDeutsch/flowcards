import { AnyActionWithId, ResolveAction, ResolveExtendAction, UIAction } from './action';
import { UpdateLoop } from './update-loop';
import { StagingFunction } from './staging';
import { Logger, LoopLog } from './logger';
import { Replay } from './replay';

//TODO: remove this and let the user use deep imports ( better for tree-shaking )
export * from './scenario';
export * from './scenario-event';
export * from './bthread';
export * from './update-loop';
export * from './name-key-map';
export * from "./bid";
export * from "./staging";
export * from './logger';
export * from './action';
export * from './extend-context';
export * from './replay';

export type UpdateCallback = (pl: {logs: LoopLog[], replay?: Replay}) => void;
export type InternalDispatch = (action: UIAction | ResolveAction | ResolveExtendAction) => void;
export type OnFinishLoopCB = (loopLog: LoopLog) => void;

export interface ScenariosProps {
    stagingFunction: StagingFunction;
    updateCB?: UpdateCallback;
    onNextLoopCB?: OnFinishLoopCB;
    doInitialUpdate: boolean;
    initialActionsOrReplay?: AnyActionWithId[] | Replay
}

function getReplay(initialActionsOrReplay?: AnyActionWithId[] | Replay): Replay | undefined {
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

export class Scenarios {
    private _bufferedActions: (UIAction | ResolveAction | ResolveExtendAction)[] = [];
    private _updateLoop: UpdateLoop;
    private _updateCB?: UpdateCallback;
    private _logger: Logger;

    constructor(props: ScenariosProps) {
        this._logger = new Logger(props.onNextLoopCB);
        this._updateLoop = new UpdateLoop(props.stagingFunction, this._internalDispatch.bind(this), this._logger);
        this._updateCB = props.updateCB;
        const replay = getReplay(props.initialActionsOrReplay);
        const logs = this._updateLoop.runStagingAndLoopSync(true, replay);
        if(this._updateCB && props.doInitialUpdate) this._updateCB({logs, replay}); // callback with initial value
    }

    private _internalDispatch(action: UIAction | ResolveAction | ResolveExtendAction) {
        this._bufferedActions.push(action);
        this._clearBufferOnNextTick();
    }

    private _clearBufferOnNextTick(): void {
        Promise.resolve().then(() => { // next tick
            if(this._bufferedActions.length === 0) return
            this._updateLoop.addToActionQueue(this._bufferedActions);
            this._bufferedActions.length = 0;
            const logs = this._updateLoop.runStagingAndLoopSync(false);
            this._updateCB?.({logs});
        });
    }

    public reset(initialActionsOrReplay?: AnyActionWithId[] | Replay): void {
        this._bufferedActions.length = 0;
        const replay = getReplay(initialActionsOrReplay);
        this._updateLoop.reset();
        const logs = this._updateLoop.runStagingAndLoopSync(true, replay);
        this._updateCB?.({logs, replay});
    }

    public onDepsChanged(): void {
        const logs = this._updateLoop.runStagingAndLoopSync(true);
        this._updateCB?.({logs});
        // TODO: make dependency-change replayable!
    }
}
