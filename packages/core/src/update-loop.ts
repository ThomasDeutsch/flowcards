import { getRequestedAction, UIAction, ResolveAction, ResolveExtendAction, AnyActionWithId, toActionWithId } from './action';
import { BThreadBids } from './bid';
import { BThread } from './bthread';
import { NameKeyMap } from './name-key-map';
import { Logger, LoopLog } from './logger';
import { advanceRejectAction, advanceRequestedAction, advanceResolveAction, advanceUiAction, advanceResolveExtendAction } from './advance-bthreads';
import { RunStaging, setupStaging, StagingFunction } from './staging';
import { allPlacedBids, AllPlacedBids, getHighestPriorityValidRequestingBid, InternalDispatch, OnFinishLoopCB, PlacedBidContext } from './index';
import { Replay } from './replay';
import { ScenarioEvent } from './scenario-event';
import { isThenable } from './utils';
import { ReactionCheck } from './reaction';


// update loop
// -----------------------------------------------------------------------------------

export type UpdateLoopFunction = () => void;
export type ReplayMap = Map<number, AnyActionWithId>;
export type ResolveActionCB = (action: ResolveAction | ResolveExtendAction) => void;
export type BThreadMap = NameKeyMap<BThread<any>>;
export type EventMap = NameKeyMap<ScenarioEvent<any>>


export class UpdateLoop {
    private _currentActionId = 0;
    private _allPlacedBids: AllPlacedBids = new NameKeyMap<PlacedBidContext>();
    private readonly _bThreadMap: BThreadMap = new NameKeyMap<BThread<any>>();
    private readonly _bThreadBids: BThreadBids[] = [];
    private readonly _logger: Logger;
    private readonly _stageScenarioAndEvents: RunStaging;
    private readonly _eventMap: EventMap = new NameKeyMap<ScenarioEvent<any>>();
    private readonly _actionQueue: (UIAction | ResolveAction | ResolveExtendAction)[] = [];
    private _replay?: Replay;

    constructor(stagingFunction: StagingFunction, internalDispatch: InternalDispatch, logger: Logger) {
        this._logger = logger;
        this._stageScenarioAndEvents = setupStaging({
            stagingFunction,
            bThreadMap: this._bThreadMap,
            eventMap: this._eventMap,
            bThreadBids: this._bThreadBids,
            internalDispatch,
            getAllPlacedBids: () => this._allPlacedBids,
            getCurrentActionId: () => this._currentActionId,
            logger: this._logger
        });
    }

    private _getQueuedAction(): UIAction | ResolveAction | ResolveExtendAction | undefined {
        const action = this._actionQueue.shift();
        if(action === undefined) return undefined;
        if(action.type === 'uiAction') {
            const validationResult = this._eventMap.get(action.eventId)?.validate(action.payload);
            if(validationResult?.isValid !== true) {
                action.isValidCB?.(false);
                return this._getQueuedAction.bind(this)();
            }
            action.isValidCB?.(true);
        }
        return action;
    }

    private _runLoop(): boolean {
        let reactionCheck = ReactionCheck.OK;
        do {
            const requestedAction = getRequestedAction(this._currentActionId, this._eventMap, getHighestPriorityValidRequestingBid(this._allPlacedBids, this._logger));
            const replayAction = this._replay?.getNextReplayAction(this._currentActionId, this._eventMap, requestedAction);
            const maybeAction = replayAction || requestedAction || this._getQueuedAction();
            if(maybeAction === undefined) {
                return false;
            }
            const action = toActionWithId(maybeAction, this._currentActionId);
            this._logger.logAction(action);
            switch(action.type) {
                case "uiAction":
                    reactionCheck = advanceUiAction(this._bThreadMap, this._eventMap, this._allPlacedBids, action);
                    break;
                case "requestedAction":
                    if(typeof action.payload === "function") {
                        const val = this._eventMap.get(action.eventId)?.value;
                        action.payload = action.payload(val);
                    }
                    if(isThenable(action.payload)) {
                        action.resolveActionId = 'pending';
                    }
                    reactionCheck = advanceRequestedAction(this._bThreadMap, this._allPlacedBids, action);
                    break;
                case "resolveAction":
                    reactionCheck = advanceResolveAction(this._bThreadMap, this._allPlacedBids, action);
                    break;
                case "resolvedExtendAction":
                    reactionCheck = advanceResolveExtendAction(this._bThreadMap, this._allPlacedBids, action);
                    break;
                case "rejectAction":
                    reactionCheck = advanceRejectAction(this._bThreadMap, action);
                    break;
            }
            if(reactionCheck !== ReactionCheck.OK) {
                console.error('Scenario-Reaction-Error: ', reactionCheck, action);
                this._replay?.abortReplay(action, reactionCheck);
            }
         } while (reactionCheck !== ReactionCheck.OK);
         this._currentActionId++;
         return true;
    }

    private runStaging() {
        this._stageScenarioAndEvents();
        this._allPlacedBids = allPlacedBids(this._bThreadBids, this._eventMap);
    }

    // public ----------------------------------------------------------------------
    public addToActionQueue(actions: (UIAction | ResolveAction | ResolveExtendAction)[]): void {
        actions.forEach(action => this._actionQueue.push(action));
    }

    public runStagingAndLoopSync(preRunStaging: boolean, replay?: Replay): LoopLog[] {
        if(replay) this._replay = replay;
        let areActionsRemaining = true;
        if(preRunStaging) {
            this.runStaging();
        }
        while(areActionsRemaining) {
            this._logger.logPlacedBids(this._allPlacedBids);
            areActionsRemaining = this._runLoop();
            if(areActionsRemaining) {
                this.runStaging();
            } else {
                this._logger.finishLoop();
            }
        }
        return this._logger.getLoopLogs();
    }

    public reset(): void {
        this._replay = undefined;
        this._currentActionId = 0;
        this._actionQueue.length = 0;
        this._bThreadMap.allValues?.forEach(bThread => bThread.destroy());
        this._eventMap.allValues?.forEach(event => {
            event.disable();
        });
        this._bThreadMap.clear();
        this._eventMap.clear();
        this._logger.resetLog();
    }
}

