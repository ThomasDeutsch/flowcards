import { ResolveAction, ResolveExtendAction, AnyAction, QueueAction, getQueuedAction, ActionType, getNextActionFromBid } from './action';
import { FlowCore } from './flow-core';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { Logger, ActionReactionLog } from './logger';
import { advanceRejectAction, advanceRequestedAction, advanceResolveAction, advanceUiAction, advanceResolveExtendAction, advanceTriggeredAction, advanceAsyncRequest } from './advance-flows';
import { Staging, StagingCB } from './staging';
import { Replay } from './replay';
import { EventCore } from './event-core';
import { BufferedQueue } from './buffered-queue';
import { AllPlacedBids, UpdateCB } from './index';


// update loop
// -----------------------------------------------------------------------------------

export type UpdateLoopFunction = () => void;
export type ReplayMap = Map<number, AnyAction>;
export type ResolveActionCB = (action: ResolveAction | ResolveExtendAction) => void;
export type FlowMap = NameKeyMap<FlowCore>;
export type GetEvent = <P,V>(eventId: NameKeyId) => EventCore<P,V> | undefined;

export interface FlowsInfo {
    logs: ActionReactionLog[];
    allPlacedBids?: AllPlacedBids;
    allRelevantFlows: NameKeyMap<void>;
    getEvent: GetEvent;
}

export interface SchedulerProps {
    stagingCB: StagingCB;
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
    private _updateCB: UpdateCB;

    constructor(props : SchedulerProps) {
        this._updateCB = props.updateCB;
        this._staging = new Staging({
            stagingCB: props.stagingCB,
            logger: this._logger,
            addToQueue: this._addToQueue.bind(this)
        });
        this._staging.run('initial');
    }



    private _getNextAction(): AnyAction | undefined {
        return this._replay?.getNextReplayAction(this._staging, this._currentActionId, this._logger) ||
        getQueuedAction(this._logger, this._actionQueue, this._staging, this._currentActionId) ||
        getNextActionFromBid(this._staging, this._currentActionId, this._logger);
    }

    private _executeNextAction(): NameKeyId | undefined {
        const action = this._getNextAction();
        if(action === undefined) {
            return undefined;
        }
        this._logger.logAction(action);
        const event = this._staging.getEvent(action.eventId);
        if(event === undefined) {
            throw new Error('event undefined');
        }
        advanceStrategyByActionType[action.type](event, this._staging, action);
        this._currentActionId++;
        return action.eventId;
    }

    private _addToQueue(action: QueueAction) {
        this._actionQueue.add(action);
        this._runSchedulerOnNextMicrotask();
    }

    private _runSchedulerOnNextMicrotask(): void {
        queueMicrotask(() => {
            if(this._actionQueue.size === 0) return
            const info = this.run();
            this._updateCB({info});
        })
    }

    // public ----------------------------------------------------------------------
    public run(replay?: Replay): FlowsInfo {
        if(replay) this._replay = replay;
        let latestEventId = this._executeNextAction();
        this._logger.finishLoop();
        while(latestEventId !== undefined) {
            this._staging.run(this._staging.getEvent(latestEventId)!);
            latestEventId = this._executeNextAction();
            this._logger.finishLoop();
        }
        return {
            allRelevantFlows: this._logger.allRelevantFlows,
            allPlacedBids: this._staging.allPlacedBids,
            getEvent: this._staging.getEvent.bind(this._staging),
            logs: this._logger.getLoopLogs()
        };
    }
}
