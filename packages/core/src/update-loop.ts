import { ActionType, GET_VALUE_FROM_BTHREAD, getRequestedAction, UIAction, ResolveAction, ResolveExtendAction, AnyActionWithId, toActionWithId } from './action';
import { BThreadBids, activeBidsByType, BidsByType, getRequestingBids } from './bid';
import { BThread, BThreadState } from './bthread';
import { EventMap, EventId, toEventId } from './event-map';
import { CachedItem, GetCachedEvent } from './event-cache';
import { Logger } from './logger';
import { advanceRejectAction, advanceRequestedAction, advanceResolveAction, advanceUiAction, advanceResolveExtendAction } from './advance-bthreads';
import { EventContext } from './event-context';
import { BThreadMap } from './bthread-map';
import { setupScaffolding, StagingFunction } from './scaffolding';
import { InternalDispatch, Replay } from './index';
import { ActionCheck, checkUiAction, checkResolveAction, checkRejectAction, checkResolveExtendAction, checkRequestedAction } from './action-check';
import { isThenable } from './utils';


// update loop
// -----------------------------------------------------------------------------------

export interface ScenariosContext {
    event: (eventName: string | EventId) => EventContext;
    thread: BThreadMap<BThreadState>;
    log: Logger;
    bids: BidsByType;
    debug: {
        currentActionId: number;
        inReplay: boolean;
        isPaused: boolean;
        testResults: Map<number, any>;  // TODO: replace any with a defined type
    }
}

export type UpdateLoopFunction = () => ScenariosContext;
export type ReplayMap = Map<number, AnyActionWithId>;
export interface CurrentReplay extends Replay {
    testResults: Map<number, any>;
}
export type ResolveActionCB = (action: ResolveAction | ResolveExtendAction) => void;
export type UIActionDispatch = (action: UIAction) => void;

export class UpdateLoop {
    private _currentActionId = 0;
    private _activeBidsByType = {} as BidsByType;
    private readonly _bThreadMap = new BThreadMap<BThread>();
    private readonly _bThreadStateMap = new BThreadMap<BThreadState>();
    private readonly _bThreadBids: BThreadBids[] = [];
    private readonly _logger: Logger;
    private readonly _scaffold: (loopCount: number) => void;
    private readonly _eventCache = new EventMap<CachedItem<any>>();
    private readonly _getCachedEvent: GetCachedEvent = (eventId: EventId) => this._eventCache.get(eventId);
    private readonly _eventContexts = new EventMap<EventContext>();
    private readonly _uiActionDispatch: UIActionDispatch;
    private readonly _testResults = new Map<number, any[]>();
    private _inReplay = false;
    private _replay?: CurrentReplay;
    private readonly _actionQueue: (UIAction | ResolveAction | ResolveExtendAction)[] = [];     
    
    constructor(stagingFunction: StagingFunction, internalDispatch: InternalDispatch, logger: Logger) {
        this._logger = logger;
        const resolveActionCB = (action: ResolveAction | ResolveExtendAction) => internalDispatch(action);
        this._scaffold = setupScaffolding(stagingFunction, this._bThreadMap, this._bThreadBids, this._bThreadStateMap, this._getCachedEvent, resolveActionCB, this._logger);
        this._uiActionDispatch = (action : UIAction) => internalDispatch(action);
    }

    private _reset() {
        this._currentActionId = 0;
        this._actionQueue.length = 0;
        this._bThreadMap.forEach(bThread => bThread.destroy());
        this._bThreadMap.clear();
        this._eventCache.clear();
        this._testResults.clear();
        this._logger.resetLog();
    }

    private _getEventContext(event: string | EventId): EventContext {
        const eventId = toEventId(event);
        let context = this._eventContexts.get(eventId);
        if(context === undefined) {
            context = new EventContext(this._getCachedEvent, this._uiActionDispatch, eventId);
            this._eventContexts.set(eventId, context);
        }
        context?.update(this._activeBidsByType, this._currentActionId);
        return context;
    }

    private _getNextReplayAction(actionId: number): AnyActionWithId | undefined {
        if(this._replay === undefined) return undefined
        const actions = this._replay.actions;
        if(actions.length > 0 && actions[0].id === actionId) {
            const action = this._replay.actions.shift()!;
            if(action.type === ActionType.requested && action.payload === GET_VALUE_FROM_BTHREAD) {
                action.payload = this._bThreadMap.get(action.bThreadId)?.currentBids?.request?.get(action.eventId)?.payload;
            }
            return action;
        }
        return undefined;
    }

    private _getContext(): ScenariosContext {
        this._inReplay = this._replay !== undefined && this._replay.actions.length > 0;
        return { 
            event: this._getEventContext.bind(this),
            thread: this._bThreadStateMap,
            log: this._logger,
            bids: this._activeBidsByType,
            debug: {
                currentActionId: this._currentActionId,
                inReplay: this._inReplay,
                isPaused: this.isPaused,
                testResults: this._testResults
            }
        }
    }

    private _runContextTests(): void {
        const tests = this._replay?.tests?.get(this._currentActionId);
        if(tests === undefined || tests.length === 0) return;
        const results: any[] = [];
        tests.forEach(scenarioTest => {
            try { 
                results.push(scenarioTest(this._getContext()));
            } catch(error) {
                this.isPaused = true;
                results.push(error);
            }
        });
        this._testResults.set(this._currentActionId, results);
    }

    private _getQueuedAction(): UIAction | ResolveAction | ResolveExtendAction | undefined {
        const action = this._actionQueue.shift();
        if(action === undefined) return undefined
        return {...action, id: this._currentActionId}
    }

    private _setupContext(): ScenariosContext {
        if(this._inReplay) this._runContextTests();
        if(this._replay?.breakpoints?.has(this._currentActionId)) this.isPaused === true;
        if(this.isPaused) return this._getContext();
        const placedRequestingBids = getRequestingBids(this._activeBidsByType);
        let actionCheck: ActionCheck | undefined = undefined;
        do {
            const maybeAction = this._getNextReplayAction(this._currentActionId) || this._getQueuedAction() || getRequestedAction(this._currentActionId, placedRequestingBids?.shift())
            if(maybeAction === undefined) return this._getContext();
            const action = toActionWithId(maybeAction, this._currentActionId);
            if (action.type === ActionType.requested) {
                actionCheck = checkRequestedAction(this._bThreadMap, this._activeBidsByType, action);
                if(actionCheck === ActionCheck.OK) {
                    if (typeof action.payload === "function") {
                        action.payload = action.payload(this._getCachedEvent(action.eventId));
                    }
                    if(isThenable(action.payload)) {
                        action.resolveActionId = 'pending';
                    }
                    this._logger.logAction(action);
                    advanceRequestedAction(this._bThreadMap, this._eventCache, this._activeBidsByType, action);
                }
            }
            else if (action.type === ActionType.resolved) {
                actionCheck = checkResolveAction(this._bThreadMap, action);
                if(actionCheck === ActionCheck.OK) {
                    this._logger.logAction(action);
                    advanceResolveAction(this._bThreadMap, this._eventCache, this._activeBidsByType, action);
                }
            }
            else if (action.type === ActionType.resolvedExtend) {
                actionCheck = checkResolveExtendAction(this._bThreadMap, action);
                if(actionCheck === ActionCheck.OK) {
                    this._logger.logAction(action);
                    advanceResolveExtendAction(this._bThreadMap, this._eventCache, this._activeBidsByType, action);
                }
            }
            else if (action.type === ActionType.ui) {
                actionCheck = checkUiAction(this._activeBidsByType, action);
                if(actionCheck === ActionCheck.OK) {
                    this._logger.logAction(action);
                    advanceUiAction(this._bThreadMap, this._activeBidsByType, action);
                }
            }
            else if (action.type === ActionType.rejected) {
                actionCheck = checkRejectAction(this._bThreadMap, action);
                if(actionCheck === ActionCheck.OK) {
                    this._logger.logAction(action);
                    advanceRejectAction(this._bThreadMap, this._activeBidsByType, action);
                }
            }
            if(this._inReplay && actionCheck !== ActionCheck.OK) {
                this.isPaused = true;
                const results = this._testResults.get(this._currentActionId) || [];
                this._testResults.set(this._currentActionId, [...results, {type: 'action-validation', message: actionCheck, action: action}]);
                return this._getContext();
            }
         } while (actionCheck !== ActionCheck.OK);

         this._currentActionId++;
         return this.runScaffolding();
    }

    // public ----------------------------------------------------------------------
    public isPaused = false;

    public setActionQueue(actions: (UIAction | ResolveAction | ResolveExtendAction)[]): void {
        this._actionQueue.length = 0;
        actions.forEach(action => this._actionQueue.push(action));
    }

    public runScaffolding(): ScenariosContext {
        this._scaffold(this._currentActionId);
        this._activeBidsByType = activeBidsByType(this._bThreadBids);
        return this._setupContext();
    }

    public startReplay(replay: Replay): ScenariosContext {
        this._replay = {...replay, testResults: new Map<number, any>()}
        // TODO: tests: 
        // - check if reactions are the same as the recorded reactions
        // - check if the action is Checked OK
        // - add context checks via chai assertions
        this._inReplay = true;
        this._reset();
        return this.runScaffolding();
    }

    public togglePaused(): ScenariosContext {
        this.isPaused = !this.isPaused;
        return this.runScaffolding();
    }
}