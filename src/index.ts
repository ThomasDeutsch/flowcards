import { AnyAction } from './action';
import { LogInfo, Scheduler } from './scheduler';
import { StagingCB } from './staging';
import { LoopLog } from './logger';
import { EventCore } from './event-core';
import { Replay, getReplay } from './replay';
import { FlowEvent, UserEvent } from './event';

export type FlowCardsContext = {log: LogInfo, replay?: Replay}
export type UpdateCB = (pl: FlowCardsContext) => void;
export type OnFinishLoopCB = (loopLog: LoopLog) => void;

export type NestedEventObject = UserEvent<any, any> | FlowEvent<any, any> | (FlowEvent<any, any> | UserEvent<any, any>)[] |
    { [key: string]: NestedEventObject };


function getEvents(obj: NestedEventObject): EventCore<any, any>[] {
    if(Array.isArray(obj)) return obj;
    if(obj instanceof EventCore) return [obj];
    return Object.values(obj).map(getEvents).flat();
}

export interface FlowCardsProps {
    stagingCB: StagingCB;
    updateCB: UpdateCB;
    onNextLoopCB?: OnFinishLoopCB;
    events: NestedEventObject;
    doInitialUpdate: boolean;
    initialActionsOrReplay?: AnyAction[] | Replay
}

export class FlowCards {
    private readonly _scheduler: Scheduler;
    public readonly initialContext: FlowCardsContext;

    constructor(props: FlowCardsProps) {
        this._scheduler = new Scheduler({
            stagingCB: props.stagingCB,
            events: getEvents(props.events),
            updateCB: props.updateCB
        });
        const replay = getReplay(props.initialActionsOrReplay);
        const log = this._scheduler.run(replay);
        if(props.doInitialUpdate) props.updateCB({log, replay}); // callback with initial value
        this.initialContext = {log, replay};
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