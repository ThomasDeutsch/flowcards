import { AnyAction } from './action';
import { FlowsInfo, Scheduler } from './scheduler';
import { StagingCB } from './staging';
import { ActionReactionLog } from './logger';
import { SelectedReplay, getReplay, Replay } from './replay';

export type FlowCardsContext = {info: FlowsInfo, replay?: SelectedReplay}
export type UpdateCB = (pl: FlowCardsContext) => void;
export type OnFinishLoopCB = (log: ActionReactionLog) => void;

export interface FlowCardsProps {
    stagingCB: StagingCB;
    updateCB: UpdateCB;
    onNextLoopCB?: OnFinishLoopCB;
    doInitialUpdate: boolean;
    initialActionsOrReplay?: AnyAction[] | Replay
}

export class FlowCards {
    private readonly _scheduler: Scheduler;
    public readonly initialContext: FlowCardsContext;

    constructor(props: FlowCardsProps) {
        this._scheduler = new Scheduler({
            stagingCB: props.stagingCB,
            updateCB: props.updateCB
        });
        const replay = getReplay(props.initialActionsOrReplay);
        const info = this._scheduler.run(replay);
        if(props.doInitialUpdate) props.updateCB({info, replay}); // callback with initial value
        this.initialContext = {info, replay};
    }
}

export * from './action';
export * from './bid';
export * from './event';
export * from './flow';
export * from './guard';
export * from './logger';
export * from './scheduler';
export * from './staging';