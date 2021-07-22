import { getRequestedAction, UIAction, ResolveAction, ResolveExtendAction, AnyActionWithId, toActionWithId } from './action';
import { BThreadBids } from './bid';
import { BThread, BThreadState } from './bthread';
import { EventMap, EventId } from './event-map';
import { Logger } from './logger';
import { advanceRejectAction, advanceRequestedAction, advanceResolveAction, advanceUiAction, advanceResolveExtendAction } from './advance-bthreads';
import { BThreadMap } from './bthread-map';
import { setupScaffolding, StagingFunction } from './scaffolding';
import { allPlacedBids, AllPlacedBids, getHighestPriorityValidRequestingBidForEveryEventId, InternalDispatch, PlacedBid, BThreadId, BidType } from './index';
import { UIActionCheck, ReactionCheck, validateAskedFor } from './validation';
import { isThenable } from './utils';
import { Replay } from './replay';
import { ScenarioEvent } from './scenario-event';


// update loop
// -----------------------------------------------------------------------------------

export interface ScenariosContext {
    id: number;
    scenario: (scenarioId: string | BThreadId) => BThreadState | undefined;
    scenarioStateMap: BThreadMap<BThreadState>,
    log: Logger;
    bids: AllPlacedBids;
    replay?: Replay;
}

export type UpdateLoopFunction = () => ScenariosContext;
export type ReplayMap = Map<number, AnyActionWithId>;
export type ResolveActionCB = (action: ResolveAction | ResolveExtendAction) => void;
export type UIActionDispatch = (bid: PlacedBid, payload: any) => void;

export class UpdateLoop {
    private _currentActionId = 0;
    private _allPlacedBids: AllPlacedBids = new EventMap();
    private readonly _bThreadMap = new BThreadMap<BThread>();
    private readonly _bThreadStateMap = new BThreadMap<BThreadState>();
    private readonly _bThreadBids: BThreadBids[] = [];
    private readonly _logger: Logger;
    private readonly _scaffold: () => void;
    private readonly _scenarioEventMap = new EventMap<ScenarioEvent<any>>();
    private readonly _actionQueue: (UIAction | ResolveAction | ResolveExtendAction)[] = [];
    private _replay?: Replay;

    constructor(events: Record<string, ScenarioEvent>, stagingFunction: StagingFunction, internalDispatch: InternalDispatch, logger: Logger) {
        this._logger = logger;
        Object.keys(events).forEach(e => {
            const event = events[e];
            event.__setUIActionCb(internalDispatch);
            this._scenarioEventMap.set(events[e].id, events[e]);
        });
        const resolveActionCB = (action: ResolveAction | ResolveExtendAction) => internalDispatch(action);
        this._scaffold = setupScaffolding(stagingFunction, this._bThreadMap, this._bThreadBids, this._bThreadStateMap, resolveActionCB, this._scenarioEventMap, this._logger);
    }

    private _getContext(): ScenariosContext {
        this._scenarioEventMap.forEach((id, event) => {
            const bidContext = this._allPlacedBids.get(id);
            const pendingByBThread = bidContext?.pendingBy ? this._bThreadMap.get(bidContext.pendingBy) : undefined;
            const cancelPending = pendingByBThread ? (message: string) => pendingByBThread.cancelPending(id, message) : undefined;
            event.__update(this._currentActionId, this._allPlacedBids, cancelPending)
        })
        return {
            id: this._currentActionId,
            scenario: (id) => this._bThreadStateMap?.get(id),
            scenarioStateMap: this._bThreadStateMap,
            log: this._logger,
            bids: this._allPlacedBids,
            replay: this._replay
        }
    }

    private _getQueuedAction(): UIAction | ResolveAction | ResolveExtendAction | undefined {
        const action = this._actionQueue.shift();
        if(action === undefined) return undefined
        return {...action, id: this._currentActionId}
    }

    private _runLoop(): ScenariosContext {
        const placedRequestingBids = getHighestPriorityValidRequestingBidForEveryEventId(this._allPlacedBids);
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
                    this._logger.logAction(action);
                    reactionCheck = advanceUiAction(this._bThreadMap, this._allPlacedBids, action);
                    break;
                }
                case "requestedAction":
                    if(typeof action.payload === "function") {
                        const currentValue = this._scenarioEventMap.get(action.eventId)?.value;
                        action.payload = action.payload(currentValue);
                    }
                    if(isThenable(action.payload)) {
                        action.resolveActionId = 'pending';
                    }
                    this._logger.logAction(action);
                    reactionCheck = advanceRequestedAction(this._bThreadMap, this._allPlacedBids, action);
                    break;
                case "resolveAction":
                    this._logger.logAction(action);
                    reactionCheck = advanceResolveAction(this._bThreadMap, this._allPlacedBids, action);
                    break;
                case "resolvedExtendAction":
                    this._logger.logAction(action);
                    reactionCheck = advanceResolveExtendAction(this._bThreadMap, this._allPlacedBids, action);
                    break;
                case "rejectAction":
                    this._logger.logAction(action);
                    reactionCheck = advanceRejectAction(this._bThreadMap, action);
            }
            this._replay?.abortReplayOnInvalidAction(action);
            if(reactionCheck !== ReactionCheck.OK) {
                console.error('Scenario-Reaction-Error: ', reactionCheck, action);
                this._replay?.abortReplayOnInvalidReaction(action, reactionCheck);
            }
            this._replay?.checkIfCompleted(action);
         } while (reactionCheck !== ReactionCheck.OK);
         this._currentActionId++;
         return this.runScaffolding();
    }

    // public ----------------------------------------------------------------------
    public setActionQueue(actions: (UIAction | ResolveAction | ResolveExtendAction)[]): void {
        this._actionQueue.length = 0;
        actions.forEach(action => this._actionQueue.push(action));
    }

    public runScaffolding(replay?: Replay): ScenariosContext {
        if(replay) this._replay = replay;
        this._scaffold();
        this._allPlacedBids = allPlacedBids(this._bThreadBids);
        return this._runLoop();
    }

    public reset(): void {
        this._currentActionId = 0;
        this._actionQueue.length = 0;
        this._bThreadMap.forEach(bThread => bThread.destroy());
        this._bThreadMap.clear();
        this._scenarioEventMap.clear();
        this._logger.resetLog();
    }

    public getBid(bThreadId: BThreadId, bidType: BidType, eventId: EventId): PlacedBid | undefined {
        return this._bThreadMap.get(bThreadId)?.getCurrentBid(bidType, eventId);
    }
}
