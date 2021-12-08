import { AnyAction, ResolveAction, ResolveExtendAction, UIAction, RejectAction } from './action';
import { LogInfo, UpdateLoop } from './update-loop';
import { StagingCB } from './staging';
import { Logger, LoopLog } from './logger';
import { Replay } from './replay';

//TODO: remove this and let the user use deep imports ( better for tree-shaking )
export * from './flow';
export * from './flow-event';
export * from './flow-core';
export * from './update-loop';
export * from './name-key-map';
export * from "./bid";
export * from "./staging";
export * from './logger';
export * from './action';
export * from './replay';

export type BehaviorContext = {log: LogInfo, replay?: Replay}
export type BufferAction = UIAction | ResolveAction | ResolveExtendAction | RejectAction;
export type UpdateCallback = (pl: BehaviorContext) => void;
export type InternalDispatch = (action: BufferAction) => void;
export type OnFinishLoopCB = (loopLog: LoopLog) => void;

export interface BehaviorsProps {
    stagingCb: StagingCB;
    updateCb?: UpdateCallback;
    onNextLoopCB?: OnFinishLoopCB;
    doInitialUpdate: boolean;
    initialActionsOrReplay?: AnyAction[] | Replay
}

function getReplay(initialActionsOrReplay?: AnyAction[] | Replay): Replay | undefined {
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

export class Behaviors {
    private _bufferedActions: BufferAction[] = [];
    private _updateLoop: UpdateLoop;
    private _updateCB?: UpdateCallback;
    private _logger: Logger;
    public readonly initialContext: BehaviorContext;

    constructor(props: BehaviorsProps) {
        this._logger = new Logger(props.onNextLoopCB);
        this._updateLoop = new UpdateLoop(props.stagingCb, this._internalDispatch.bind(this), this._logger);
        this._updateCB = props.updateCb;
        const replay = getReplay(props.initialActionsOrReplay);
        const log = this._updateLoop.runStagingAndLoopSync(true, replay);
        if(this._updateCB && props.doInitialUpdate) this._updateCB({log, replay}); // callback with initial value
        this.initialContext = {log, replay};
    }

    private _internalDispatch(action: BufferAction) {
        this._bufferedActions.push(action);
        this._clearBufferOnNextTick();
    }

    private _clearBufferOnNextTick(): void {
        Promise.resolve().then(() => { // next tick
            if(this._bufferedActions.length === 0) return
            this._updateLoop.addToActionQueue(this._bufferedActions);
            this._bufferedActions.length = 0;
            const log = this._updateLoop.runStagingAndLoopSync(false);
            this._updateCB?.({log});
        });
    }

    public reset(initialActionsOrReplay?: AnyAction[] | Replay): void {
        this._bufferedActions.length = 0;
        const replay = getReplay(initialActionsOrReplay);
        this._updateLoop.reset();
        const log = this._updateLoop.runStagingAndLoopSync(true, replay);
        this._updateCB?.({log, replay});
    }

    public onDepsChanged(): void {
        const log = this._updateLoop.runStagingAndLoopSync(true);
        this._updateCB?.({log});
        // TODO: make dependency-change replayable!
    }
}
