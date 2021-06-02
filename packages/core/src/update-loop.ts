import { ActionType, GET_VALUE_FROM_BTHREAD, getRequestedAction, UIAction, ResolveAction, ResolveExtendAction, AnyActionWithId, toActionWithId } from './action';
import { BThreadBids } from './bid';
import { BThread, BThreadState } from './bthread';
import { EventMap, EventId, toEventId } from './event-map';
import { CachedItem, GetCachedEvent } from './event-cache';
import { Logger } from './logger';
import { advanceRejectAction, advanceRequestedAction, advanceResolveAction, advanceUiAction, advanceResolveExtendAction } from './advance-bthreads';
import { BThreadMap } from './bthread-map';
import { setupScaffolding, StagingFunction } from './scaffolding';
import { allPlacedBids, AllPlacedBids, AnyAction, getHighestPriorityValidRequestingBidForEveryEventId, getHighestPrioAskForBid, InternalDispatch, PlacedBid, Replay, ContextTestResult } from './index';
import { UIActionCheck, ReactionCheck, validateAskedFor, askForValidationExplainCB, CombinedValidationCB } from './validation';
import { isThenable } from './utils';


export interface EventInfo {
    lastUpdate: number;
    dispatch?: (payload?: any) => void;
    validate: CombinedValidationCB<unknown>;
    value?: unknown;
    history: unknown[];
    isPending: boolean;
    isBlocked: boolean;
}

// update loop
// -----------------------------------------------------------------------------------

export interface ScenariosContext {
    event: (eventName: string | EventId) => EventInfo;
    thread: BThreadMap<BThreadState>;
    log: Logger;
    debug: {
        currentActionId: number;
        inReplay: boolean;
        isPaused: boolean;
        testResults?: Record<number, any>;  // TODO: replace any with a defined type
    }
}

export type UpdateLoopFunction = () => ScenariosContext;
export type ReplayMap = Map<number, AnyActionWithId>;
export interface CurrentReplay extends Replay {
    isPaused: boolean;
    testResults: Record<number, any>;
}
export type ResolveActionCB = (action: ResolveAction | ResolveExtendAction) => void;
export type UIActionDispatch = (bid: PlacedBid, payload: any) => void;

export class UpdateLoop {
    private _currentActionId = 0;
    private _allPlacedBids: AllPlacedBids = new EventMap();
    private readonly _bThreadMap = new BThreadMap<BThread>();
    private readonly _bThreadStateMap = new BThreadMap<BThreadState>();
    private readonly _bThreadBids: BThreadBids[] = [];
    private readonly _logger: Logger;
    private readonly _scaffold: (loopCount: number) => void;
    private readonly _eventCache = new EventMap<CachedItem<any>>();
    private readonly _getCachedEvent: GetCachedEvent = (eventId: EventId) => this._eventCache.get(eventId);
    private readonly _eventInfos= new EventMap<EventInfo>();
    private readonly _uiActionCB: UIActionDispatch;
    private _testResults: Record<number, any[]> | undefined;
    private _replay?: CurrentReplay;
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

    private _reset() {
        this._currentActionId = 0;
        this._actionQueue.length = 0;
        this._bThreadMap.forEach(bThread => bThread.destroy());
        this._bThreadMap.clear();
        this._eventCache.clear();
        delete this._testResults;
        this._logger.resetLog();
    }

    private _getEventInfo(event: string | EventId): EventInfo {
        const eventId = toEventId(event);
        const eventInfo = this._eventInfos.get(eventId);
        if(eventInfo && eventInfo.lastUpdate === this._currentActionId - 1) return eventInfo;
        const askForBid = getHighestPrioAskForBid(this._allPlacedBids, eventId);
        const bidContext = this._allPlacedBids.get(eventId);
        const cachedEvent = this._getCachedEvent(eventId);
        const newEventInfo: EventInfo = eventInfo || {} as EventInfo;
        const validateCheck = askForValidationExplainCB(askForBid, bidContext);
        newEventInfo.lastUpdate = this._currentActionId - 1,
        newEventInfo.dispatch = (askForBid && bidContext && !bidContext.pendingBy && !bidContext.blockedBy) ? (payload: any) => {
            validateCheck(payload).isValid && this._uiActionCB(askForBid, payload);
        } : undefined;
        newEventInfo.validate = validateCheck;
        newEventInfo.value = cachedEvent?.value,
        newEventInfo.history = cachedEvent?.history || [],
        newEventInfo.isPending = !!bidContext?.pendingBy,
        newEventInfo.isBlocked = !!bidContext?.blockedBy
        this._eventInfos.set(eventId, newEventInfo);
        return newEventInfo
    }

    private _getNextReplayAction(actionId: number): AnyActionWithId | undefined {
        if(this._replay === undefined) return undefined
        const actions = this._replay.actions;
        if(actions.length > 0 && actions[0].id === actionId) {
            const action = this._replay.actions.shift()!;
            if(action.type === "requestedAction" && action.payload === GET_VALUE_FROM_BTHREAD) {
                action.payload = this._bThreadMap.get(action.bThreadId)?.currentBids?.pendingBidMap.get(action.eventId)?.payload;
            }
            return action;
        }
        return undefined;
    }

    private _isInReplay(): boolean {
        return this._replay !== undefined && this._replay.actions.length > 0;
    }

    private _getContext(): ScenariosContext {
        return { 
            event: this._getEventInfo.bind(this),
            thread: this._bThreadStateMap,
            log: this._logger,
            debug: {
                currentActionId: this._currentActionId,
                inReplay: this._isInReplay(),
                isPaused: !!this._replay?.isPaused,
                testResults: this._testResults
            }
        }
    }

    private _runContextTests(): void {
        if(this._replay === undefined) return;
        const tests = this._replay.tests?.[this._currentActionId];
        if(tests === undefined || tests.length === 0) return;
        const results: ContextTestResult[] = [];
        tests.forEach(scenarioTest => {
            try { 
                const result = scenarioTest(this._getContext());
                if(result) results.push(result);
            } catch(error) {
                this._replay!.isPaused = true;
                results.push({isValid: false, details: error});
                throw(error);
            }
        });
        if(results) {
            if(!this._testResults) this._testResults = {};
            this._testResults[this._currentActionId] = results;
        }
        
    }

    private _getQueuedAction(): UIAction | ResolveAction | ResolveExtendAction | undefined {
        const action = this._actionQueue.shift();
        if(action === undefined) return undefined
        return {...action, id: this._currentActionId}
    }

    private _pauseReplay() {
        this._replay!.isPaused = true;
        this._runContextTests();       
    }

    private _runLoop(): ScenariosContext {
        if(this._replay) {
            this._runContextTests();
            if(this._replay?.breakpoints?.has(this._currentActionId)) this._replay.isPaused = true;
            if(this._replay?.isPaused === true) return this._getContext();
        }
        const placedRequestingBids = getHighestPriorityValidRequestingBidForEveryEventId(this._allPlacedBids);
        let reactionCheck = ReactionCheck.OK;
        let uiActionCheck = UIActionCheck.OK;
        do {
            const maybeAction = this._getNextReplayAction(this._currentActionId)
                || this._getQueuedAction() 
                || getRequestedAction(this._currentActionId, placedRequestingBids?.pop())
            if(maybeAction === undefined) return this._getContext();
            const action = toActionWithId(maybeAction, this._currentActionId);

            if (action.type === "uiAction") {
                uiActionCheck = validateAskedFor(maybeAction, this._allPlacedBids);
                if(uiActionCheck !== UIActionCheck.OK) {
                    if(this._replay) { 
                        this._pauseReplay();
                        return this._getContext(); 
                    }
                    continue;
                }
                this._logger.logAction(action);
                advanceUiAction(this._bThreadMap, this._allPlacedBids, action);
            }
            else if (action.type === "requestedAction") {
                if(this._replay && action.payload === undefined) {
                    const currentBid = this._bThreadMap.get(action.bThreadId)?.getCurrentBid(action.bidType, action.eventId);
                    action.payload = currentBid?.payload;
                }
                if(typeof action.payload === "function") {
                    action.payload = action.payload(this._getCachedEvent(action.eventId));
                }
                if(isThenable(action.payload)) {
                    action.resolveActionId = 'pending';
                }
                this._logger.logAction(action);
                reactionCheck = advanceRequestedAction(this._bThreadMap, this._eventCache, this._allPlacedBids, action);
            }
            else if (action.type === "resolveAction") {
                this._logger.logAction(action);
                reactionCheck = advanceResolveAction(this._bThreadMap, this._eventCache, this._allPlacedBids, action);
            }
            else if (action.type === "resolvedExtendAction") {
                this._logger.logAction(action);
                reactionCheck = advanceResolveExtendAction(this._bThreadMap, this._eventCache, this._allPlacedBids, action);
            }
            else if (action.type === "rejectedAction") {
                this._logger.logAction(action);
                reactionCheck = advanceRejectAction(this._bThreadMap, this._allPlacedBids, action);
            }
            if(reactionCheck !== ReactionCheck.OK) {
                console.warn('BThreadReactionError: ', reactionCheck, action);
                if(this._replay) {
                    this._pauseReplay();
                    return this._getContext(); 
                }
            }
         } while (reactionCheck !== ReactionCheck.OK);
         this._currentActionId++;
         return this.runScaffolding();
    }

    // public ----------------------------------------------------------------------
    public setActionQueue(actions: (UIAction | ResolveAction | ResolveExtendAction)[]): void {
        this._actionQueue.length = 0;
        actions.forEach(action => this._actionQueue.push(action));
    }

    public runScaffolding(): ScenariosContext {
        if(this._replay && this._replay.actions.length === 0) delete this._replay;
        this._scaffold(this._currentActionId);
        this._allPlacedBids = allPlacedBids(this._bThreadBids);
        return this._runLoop();
    }

    public startReplay(replay: Replay): ScenariosContext {
        this._replay = {...replay, testResults: new Map<number, any>(), isPaused: false}
        // TODO: tests: 
        // - check if reactions are the same as the recorded reactions
        // - check if the action is Checked OK
        // - add context checks via chai assertions
        this._reset();
        return this.runScaffolding();
    }

    public togglePaused(): ScenariosContext | undefined {
        if(this._replay) {
            this._replay.isPaused = !this._replay.isPaused
            return this.runScaffolding();
        }
        return undefined;
    }
}