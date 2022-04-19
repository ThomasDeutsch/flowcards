import { ResolveAction, ResolveExtendAction, AnyAction, QueueAction, getQueuedAction, ActionType, getNextRequestedAction } from './action';
import { FlowCore } from './flow-core';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { Logger, LoopLog } from './logger';
import { advanceRejectAction, advanceRequestedAction, advanceResolveAction, advanceUiAction, advanceResolveExtendAction, advanceTriggeredAction, advanceAsyncRequest } from './advance-flows';
import { Staging, StagingCB } from './staging';
import { Replay } from './replay';
import { EventCore, FlowEvent, UserEvent } from './event-core';
import { BufferedQueue } from 'buffered-queue';
import { UpdateCB } from 'index';


// update loop
// -----------------------------------------------------------------------------------

export type UpdateLoopFunction = () => void;
export type ReplayMap = Map<number, AnyAction>;
export type ResolveActionCB = (action: ResolveAction | ResolveExtendAction) => void;
export type FlowMap = NameKeyMap<FlowCore>;
export type EventMap = NameKeyMap<EventCore<any, any> | UserEvent<any, any>>;
export type GetEvent = <P,V>(eventId: NameKeyId) => EventCore<P,V> | undefined;

export interface LogInfo {
    logs: LoopLog[];
    allRelevantScenarios: NameKeyMap<void>;
}

export interface SchedulerProps {
    stagingCB: StagingCB;
    events: EventCore[];
    updateCB: UpdateCB;
}

type AdvanceFlowsFunction = (e: EventCore<any, any>, s: Staging, a: any ) => void;

const advanceStrategyByActionType: Record<ActionType, AdvanceFlowsFunction> = {
    uiAction: advanceUiAction,
    requestedAction: advanceRequestedAction,
    triggeredAction: advanceTriggeredAction,
    requestedAsyncAction: advanceAsyncRequest,
    resolveAction: advanceResolveAction,
    resolvedExtendAction: advanceResolveExtendAction,
    rejectAction: advanceRejectAction
}

export class Scheduler {
    private _currentActionId = 0;
    private readonly _logger = new Logger();
    private _actionQueue = new BufferedQueue<QueueAction>();
    private _replay?: Replay;
    private _staging: Staging;
    private _eventMap = new NameKeyMap<FlowEvent<any, any> | UserEvent<any, any>>();
    private _updateCB: UpdateCB;

    constructor(props : SchedulerProps) {
        this._updateCB = props.updateCB;
        this._staging = new Staging({
            stagingCB: props.stagingCB,
            logger: this._logger,
            addToQueue: this._addToQueueAsync.bind(this)
        });
        props.events.forEach(event => {
            if(this._eventMap.has(event.id)) {
                throw new Error('event in enabled multiple times: ' + event.id)
            }
            event.__connect({
                addToQueue: this._addToQueueAsync.bind(this),
                getPlacedBids: this._staging.getPlacedBids.bind(this._staging),
                getPending: this._staging.getPending.bind(this._staging)
            });
            this._eventMap.set(event.id, event);
        });
        this._staging.run();
    }

    private _getEvent<P,V>(eventId: NameKeyId): EventCore<P,V> | undefined {
        return this._eventMap.get(eventId);
    }

    private _getNextAction(): AnyAction | undefined {
        return this._replay?.getNextReplayAction(this._getEvent.bind(this), this._staging, this._currentActionId, this._logger) ||
        getQueuedAction(this._logger, this._actionQueue, this._eventMap, this._staging, this._currentActionId) ||
        getNextRequestedAction(this._getEvent.bind(this), this._staging, this._currentActionId, this._logger);
    }

    private _executeNextAction(): boolean {
        const action = this._getNextAction();
        if(action === undefined) {
            return false;
        }
        this._logger.logAction(action);
        const event = this._getEvent(action.eventId);
        if(event === undefined) {
            throw new Error('event undefined');
        }
        advanceStrategyByActionType[action.type](event, this._staging, action);
        this._logger.finishLoop();
        this._currentActionId++;
        return true;
    }

    private _addToQueueAsync(action: QueueAction) {
        this._actionQueue.add(action);
        this._runSchedulerOnNextMicrotask();
    }

    private _runSchedulerOnNextMicrotask(): void {
        Promise.resolve().then(() => { // start a microtask
            if(this._actionQueue.size === 0) return
            const log = this.run();
            this._updateCB({log});
        });
    }

    // public ----------------------------------------------------------------------
    public run(replay?: Replay): LogInfo {
        if(replay) this._replay = replay;
        while(this._executeNextAction()) {
            this._staging.run();
        }
        return {
            allRelevantScenarios: this._logger.allRelevantScenarios,
            logs: this._logger.getLoopLogs()
        };
    }
}
