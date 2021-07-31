import { getRequestedAction, UIAction, ResolveAction, ResolveExtendAction, AnyActionWithId, toActionWithId } from './action';
import { BThreadBids } from './bid';
import { BThread } from './bthread';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { Logger } from './logger';
import { advanceRejectAction, advanceRequestedAction, advanceResolveAction, advanceUiAction, advanceResolveExtendAction } from './advance-bthreads';
import { RunStaging, setupStaging, StagingFunction } from './staging';
import { allPlacedBids, AllPlacedBids, getHighestPriorityValidRequestingBidForEveryNameKeyId, InternalDispatch, PlacedBid, BidType, PlacedBidContext } from './index';
import { UIActionCheck, ReactionCheck, validateAskedFor } from './validation';
import { isThenable } from './utils';
import { Replay } from './replay';
import { ScenarioEvent } from './scenario-event';


// update loop
// -----------------------------------------------------------------------------------
export interface ScenariosContext {
    id: number;
    log: Logger;
    bids: AllPlacedBids;
    replay?: Replay;
}

export type UpdateLoopFunction = () => ScenariosContext;
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
    private _areBThreadsProgressing = false;

    private _checkIfBThreadsProgressing(): boolean {
        return this._areBThreadsProgressing;
    }

    constructor(stagingFunction: StagingFunction, internalDispatch: InternalDispatch, logger: Logger) {
        this._logger = logger;
        this._stageScenarioAndEvents = setupStaging({
            stagingFunction,
            bThreadMap: this._bThreadMap,
            eventMap: this._eventMap,
            bThreadBids: this._bThreadBids,
            internalDispatch,
            areBThreadsProgressing: this._checkIfBThreadsProgressing.bind(this),
            logger: this._logger
        });
    }

    private _advanceBThreads<T extends AnyActionWithId>(progressFn: (action: T) => ReactionCheck, action: T): ReactionCheck {
        this._logger.logAction(action);
        this._areBThreadsProgressing = true;
        const reactionCheck = progressFn(action);
        this._areBThreadsProgressing = false;
        return reactionCheck;
    }

    private _getContext(): ScenariosContext {
        return {
            id: this._currentActionId,
            log: this._logger,
            bids: this._allPlacedBids,
            replay: this._replay

            // update Facades
            // - events
            // - scenarios
        }
    }

    private _getQueuedAction(): UIAction | ResolveAction | ResolveExtendAction | undefined {
        const action = this._actionQueue.shift();
        if(action === undefined) return undefined
        return {...action, id: this._currentActionId}
    }

    private _runLoop(): ScenariosContext {
        const placedRequestingBids = getHighestPriorityValidRequestingBidForEveryNameKeyId(this._allPlacedBids);
        let reactionCheck = ReactionCheck.OK;
        do {
            const maybeAction =
                this._replay?.getNextReplayAction(this.getBid.bind(this), this._currentActionId)
                || getRequestedAction(this._currentActionId, placedRequestingBids?.pop())
                || this._getQueuedAction();
            if(maybeAction === undefined) {
                return this._getContext();
            }
            const action = toActionWithId(maybeAction, this._currentActionId);
            switch(action.type) {
                case "uiAction": {
                    const uiActionCheck = validateAskedFor(action, this._allPlacedBids);
                    if(uiActionCheck !== UIActionCheck.OK) {
                        console.warn('invalid action: ', uiActionCheck, action);
                        continue;
                    }
                    reactionCheck = this._advanceBThreads(
                        (action) => advanceUiAction(this._bThreadMap, this._eventMap, this._allPlacedBids, action),
                        action);
                    break;
                }
                case "requestedAction":
                    if(typeof action.payload === "function") {
                        const val = this._eventMap.get(action.eventId)?.value;
                        action.payload = action.payload(val);
                    }
                    if(isThenable(action.payload)) {
                        action.resolveActionId = 'pending';
                    }
                    reactionCheck = this._advanceBThreads(
                        (action) => advanceRequestedAction(this._bThreadMap, this._allPlacedBids, action),
                        action);
                    break;
                case "resolveAction":
                    reactionCheck = this._advanceBThreads(
                        (action) => advanceResolveAction(this._bThreadMap, this._allPlacedBids, action),
                        action)
                    break;
                case "resolvedExtendAction":
                    reactionCheck = this._advanceBThreads(
                        (action) => advanceResolveExtendAction(this._bThreadMap, this._allPlacedBids, action),
                        action);
                    break;
                case "rejectAction":
                    reactionCheck = this._advanceBThreads(
                        (action) => advanceRejectAction(this._bThreadMap, action),
                        action);
            }
            this._replay?.abortReplayOnInvalidAction(action);
            if(reactionCheck !== ReactionCheck.OK) {
                console.error('Scenario-Reaction-Error: ', reactionCheck, action);
                this._replay?.abortReplayOnInvalidReaction(action, reactionCheck);
            }
            this._replay?.checkIfCompleted(action);
         } while (reactionCheck !== ReactionCheck.OK);
         this._currentActionId++;
         return this.runStagingAndLoop();
    }

    // public ----------------------------------------------------------------------
    public setActionQueue(actions: (UIAction | ResolveAction | ResolveExtendAction)[]): void {
        this._actionQueue.length = 0;
        actions.forEach(action => this._actionQueue.push(action));
    }

    public runStagingAndLoop(replay?: Replay): ScenariosContext {
        if(replay) this._replay = replay;
        this._stageScenarioAndEvents();
        this._allPlacedBids = allPlacedBids(this._bThreadBids, this._eventMap);
        this._eventMap.allValues?.forEach(event => {
            event.__update(this._currentActionId, this._allPlacedBids)
        });
        return this._runLoop();
    }

    public reset(): void {
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

    public getBid(bThreadId: NameKeyId, bidType: BidType, eventId: NameKeyId): PlacedBid | undefined {
        return this._bThreadMap.get(bThreadId)?.getCurrentBid(bidType, eventId);
    }
}
