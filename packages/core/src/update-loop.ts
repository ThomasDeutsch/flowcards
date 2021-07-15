import { getRequestedAction, UIAction, ResolveAction, ResolveExtendAction, AnyActionWithId, toActionWithId } from './action';
import { BThreadBids } from './bid';
import { BThread, BThreadState } from './bthread';
import { EventMap, EventId, toEventId } from './event-map';
import { CachedItem, getEventCache } from './event-cache';
import { Logger } from './logger';
import { advanceRejectAction, advanceRequestedAction, advanceResolveAction, advanceUiAction, advanceResolveExtendAction } from './advance-bthreads';
import { BThreadMap } from './bthread-map';
import { setupScaffolding, StagingFunction } from './scaffolding';
import { allPlacedBids, AllPlacedBids, getHighestPriorityValidRequestingBidForEveryEventId, getHighestPrioAskForBid, InternalDispatch, PlacedBid, BThreadId, BidType } from './index';
import { UIActionCheck, ReactionCheck, validateAskedFor, askForValidationExplainCB, CombinedValidationCB } from './validation';
import { isThenable } from './utils';
import { Replay } from './replay';

export interface EventInfo<T = any> {
    lastUpdate: number;
    dispatch?: (payload?: any) => void;
    validate: CombinedValidationCB<unknown>;
    value?: T;
    history: unknown[];
    isPending: boolean;
    isBlocked: boolean;
    cancelPending?: (message: string) => boolean
}

export type GetEventInfo = <T = any>(eventName: string | EventId) => EventInfo<T>;

// update loop
// -----------------------------------------------------------------------------------

export interface ScenariosContext {
    id: number;
    event: GetEventInfo;
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
    private readonly _eventCache = new EventMap<CachedItem<unknown>>();
    private readonly _getCachedEvent = <T>(eventId: string | EventId) => getEventCache<T>(this._eventCache, eventId);
    private readonly _eventInfos= new EventMap<EventInfo<unknown>>();
    private readonly _uiActionCB: UIActionDispatch;
    private readonly _actionQueue: (UIAction | ResolveAction | ResolveExtendAction)[] = [];

    constructor(stagingFunction: StagingFunction, internalDispatch: InternalDispatch, logger: Logger) {
        this._logger = logger;
        const resolveActionCB = (action: ResolveAction | ResolveExtendAction) => internalDispatch(action);
        this._scaffold = setupScaffolding(stagingFunction, this._bThreadMap, this._bThreadBids, this._bThreadStateMap, this._getCachedEvent, resolveActionCB, this._logger);
        this._uiActionCB = (bid: PlacedBid, payload: any) => {
            const uiAction: UIAction = {
                type: "uiAction",
                eventId: bid.eventId,
                payload: payload
            }
            internalDispatch(uiAction);
        }
    }

    private _getEventInfo<T = any>(event: string | EventId): EventInfo<T> {
        const eventId = toEventId(event);
        const eventInfo = this._eventInfos.get(eventId) as EventInfo<T> | undefined;
        if(eventInfo && eventInfo.lastUpdate === this._currentActionId) return eventInfo as EventInfo<T>;
        const askForBid = getHighestPrioAskForBid(this._allPlacedBids, eventId);
        const bidContext = this._allPlacedBids.get(eventId);
        const cachedEvent = this._getCachedEvent<T>(eventId);
        const newEventInfo: EventInfo<T> = eventInfo || {} as EventInfo<T>;
        const validateCheck = askForValidationExplainCB(askForBid, bidContext);
        newEventInfo.lastUpdate = this._currentActionId;
        newEventInfo.dispatch = (askForBid && bidContext && !bidContext.pendingBy && !bidContext.blockedBy) ? (payload: any) => {
            validateCheck(payload).isValid && this._uiActionCB(askForBid, payload);
        } : undefined;
        newEventInfo.validate = validateCheck;
        newEventInfo.value = cachedEvent?.value;
        newEventInfo.history = cachedEvent?.history || [];
        const pendingByThread = bidContext?.pendingBy ? this._bThreadMap.get(bidContext?.pendingBy) : undefined;
        newEventInfo.isPending = !!pendingByThread;
        newEventInfo.cancelPending = pendingByThread !== undefined ? (message: string) => pendingByThread.cancelPending(eventId, message) : undefined,
        newEventInfo.isBlocked = !!bidContext?.blockedBy;
        this._eventInfos.set(eventId, newEventInfo);
        return newEventInfo
    }

    private _getContext(replay?: Replay): ScenariosContext {
        return {
            id: this._currentActionId,
            event: this._getEventInfo.bind(this),
            scenario: (id) => this._bThreadStateMap?.get(id),
            scenarioStateMap: this._bThreadStateMap,
            log: this._logger,
            bids: this._allPlacedBids,
            replay: replay
        }
    }

    private _getQueuedAction(): UIAction | ResolveAction | ResolveExtendAction | undefined {
        const action = this._actionQueue.shift();
        if(action === undefined) return undefined
        return {...action, id: this._currentActionId}
    }

    private _runLoop(replay?: Replay): ScenariosContext {
        const placedRequestingBids = getHighestPriorityValidRequestingBidForEveryEventId(this._allPlacedBids);
        let reactionCheck = ReactionCheck.OK;
        do {
            const maybeAction =
                replay?.getNextReplayAction(this.getBid.bind(this), this._currentActionId)
                || getRequestedAction(this._currentActionId, placedRequestingBids?.pop())
                || this._getQueuedAction();
            if(maybeAction === undefined) {
                return this._getContext(replay);
            }
            const action = toActionWithId(maybeAction, this._currentActionId);
            switch(action.type) {
                case "uiAction": {
                    const uiActionCheck = validateAskedFor(action, this._allPlacedBids);
                    replay?.abortReplayOnInvalidAction(action, uiActionCheck);
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
                        action.payload = action.payload(this._getCachedEvent(action.eventId));
                    }
                    if(isThenable(action.payload)) {
                        action.resolveActionId = 'pending';
                    }
                    replay?.abortReplayOnInvalidAction(action);
                    this._logger.logAction(action);
                    reactionCheck = advanceRequestedAction(this._bThreadMap, this._eventCache, this._allPlacedBids, action);
                    break;
                case "resolveAction":
                    replay?.abortReplayOnInvalidAction(action);
                    this._logger.logAction(action);
                    reactionCheck = advanceResolveAction(this._bThreadMap, this._eventCache, this._allPlacedBids, action);
                    break;
                case "resolvedExtendAction":
                    replay?.abortReplayOnInvalidAction(action);
                    this._logger.logAction(action);
                    reactionCheck = advanceResolveExtendAction(this._bThreadMap, this._eventCache, this._allPlacedBids, action);
                    break;
                case "rejectAction":
                    replay?.abortReplayOnInvalidAction(action);
                    this._logger.logAction(action);
                    reactionCheck = advanceRejectAction(this._bThreadMap, this._allPlacedBids, action);
            }
            if(reactionCheck !== ReactionCheck.OK) {
                console.error('Scenario-Reaction-Error: ', reactionCheck, action);
                replay?.abortReplayOnInvalidReaction(action, reactionCheck);
            }
            replay?.checkIfCompleted(action);
         } while (reactionCheck !== ReactionCheck.OK);
         this._currentActionId++;
         return this.runScaffolding(replay);
    }

    // public ----------------------------------------------------------------------
    public setActionQueue(actions: (UIAction | ResolveAction | ResolveExtendAction)[]): void {
        this._actionQueue.length = 0;
        actions.forEach(action => this._actionQueue.push(action));
    }

    public runScaffolding(replay?: Replay): ScenariosContext {
        this._scaffold();
        this._allPlacedBids = allPlacedBids(this._bThreadBids);
        return this._runLoop(replay);
    }

    public reset(): void {
        this._currentActionId = 0;
        this._actionQueue.length = 0;
        this._bThreadMap.forEach(bThread => bThread.destroy());
        this._bThreadMap.clear();
        this._eventCache.clear();
        this._eventInfos.clear();
        this._logger.resetLog();
    }

    public getBid(bThreadId: BThreadId, bidType: BidType, eventId: EventId): PlacedBid | undefined {
        return this._bThreadMap.get(bThreadId)?.getCurrentBid(bidType, eventId);
    }
}
