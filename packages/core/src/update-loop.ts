import { ResolveAction, ResolveExtendAction, getNextRequestedAction } from './action';
import { BidType, PlacedBid } from './bid';
import { BThreadCore } from './bthread-core';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { Logger, LoopLog } from './logger';
import { advanceRejectAction, advanceRequestedAction, advanceResolveAction, advanceUiAction, advanceResolveExtendAction, advanceTriggeredAction } from './advance-bthreads';
import { RunStaging, setupStaging, StagingCB } from './staging';
import { allPlacedBids, AllPlacedBids, AnyAction, BufferAction, getQueuedAction, InternalDispatch } from './index';
import { Replay } from './replay';
import { BEvent, BUIEvent } from './b-event';


// update loop
// -----------------------------------------------------------------------------------

export type UpdateLoopFunction = () => void;
export type ReplayMap = Map<number, AnyAction>;
export type ResolveActionCB = (action: ResolveAction | ResolveExtendAction) => void;
export type BThreadMap = NameKeyMap<BThreadCore<any>>;
export type EventMap = NameKeyMap<BEvent<any, any> | BUIEvent<any, any>>;
export interface LogInfo {
    logs: LoopLog[];
    allRelevantScenarios: NameKeyMap<void>;
}

export class UpdateLoop {
    private _currentActionId = 0;
    private _allPlacedBids?: AllPlacedBids;
    private readonly _bThreadMap: BThreadMap = new NameKeyMap<BThreadCore<any>>();
    private readonly _bThreadBids: PlacedBid<unknown>[] = [];
    private readonly _logger: Logger;
    private readonly _stageBThreadsAndEvents: RunStaging;
    private readonly _eventMap: EventMap = new NameKeyMap<BEvent<any, any> | BUIEvent<any, any>>();
    private readonly _actionQueue: BufferAction[] = [];
    private _replay?: Replay;

    constructor(stagingCb: StagingCB, internalDispatch: InternalDispatch, logger: Logger) {
        this._logger = logger;
        this._stageBThreadsAndEvents = setupStaging({
            stagingCb,
            bThreadMap: this._bThreadMap,
            eventMap: this._eventMap,
            bThreadBids: this._bThreadBids,
            internalDispatch,
            getBids: (eventId: NameKeyId, bidType: BidType) => this._allPlacedBids?.[bidType].get(eventId),
            logger: this._logger
        });
    }

    private _runLoop(): boolean {
        const action: AnyAction | undefined =
            this._replay?.getNextReplayAction(this._eventMap, this._allPlacedBids!, this._currentActionId, this._logger) ||
            getQueuedAction(this._actionQueue, this._eventMap, this._currentActionId) ||
            getNextRequestedAction(this._eventMap, this._allPlacedBids!, this._currentActionId, this._logger);
        if(action === undefined) {
            return false;
        }
        this._logger.logAction(action);
        const event = this._eventMap.get(action.eventId)!;
        switch(action.type) {
            case "uiAction":
                advanceUiAction(event, this._bThreadMap, this._allPlacedBids!, action);
                break;
            case "requestedAction":
                advanceRequestedAction(event, this._bThreadMap, this._allPlacedBids!, action);
                break;
            case "triggeredAction":
                advanceTriggeredAction(event, this._bThreadMap, this._allPlacedBids!, action);
                break;
            case "requestedAsyncAction":
                event.__dispatchOnPromiseResolve(action);
                break;
            case "resolveAction":
                advanceResolveAction(event, this._bThreadMap, this._allPlacedBids!, action);
                break;
            case "resolvedExtendAction":
                advanceResolveExtendAction(event, this._bThreadMap, this._allPlacedBids!, action);
                break;
            case "rejectAction":
                advanceRejectAction(event, this._bThreadMap, this._allPlacedBids!, action);
                break;
        }
        this._logger.finishLoop();
        this._currentActionId++;
        return true;
    }

    private runStaging() {
        this._stageBThreadsAndEvents();
        this._allPlacedBids = allPlacedBids(this._bThreadBids);
        this._logger.logPlacedBids(this._allPlacedBids);
    }

    // public ----------------------------------------------------------------------
    public addToActionQueue(actions: BufferAction[]): void {
        actions.forEach(action => this._actionQueue.push(action));
    }

    public runStagingAndLoopSync(preRunStaging: boolean, replay?: Replay): LogInfo {
        if(replay) this._replay = replay;
        if(preRunStaging) {
            this.runStaging();
        }
        while(this._runLoop()) {
            this.runStaging();
        }
        return {
            allRelevantScenarios: this._logger.allRelevantScenarios,
            logs: this._logger.getLoopLogs()
        };
    }

    public reset(): void {
        this._replay = undefined;
        this._currentActionId = 0;
        this._actionQueue.length = 0;
        this._eventMap.allValues?.forEach(event => {
            event.__unplug();
        });
        this._bThreadMap.clear();
        this._eventMap.clear();
        this._logger.resetLog();
    }
}
