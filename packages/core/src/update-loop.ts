import { Action, ActionType, GET_VALUE_FROM_BTHREAD, getActionFromBid } from './action';
import { BThreadBids, activeBidsByType, BidsByType, getActiveBidsForSelectedTypes } from './bid';
import { BThread, BThreadState } from './bthread';
import { EventMap, EventId, toEventId } from './event-map';
import { CachedItem, GetCachedItem } from './event-cache';
import { Logger } from './logger';
import { advanceRejectAction, advanceRequestAction, advanceResolveAction, advanceUiAction } from './advance-bthreads';
import { EventContext } from './event-context';
import { BThreadMap } from './bthread-map';
import * as utils from './utils';
import { setupScaffolding, StagingFunction } from './scaffolding';
import { SingleActionDispatch, ActionWithId, Replay, BidType } from './index';
import { ActionCheck, checkRequestAction, checkUiAction, checkResolveAction, checkRejectAction } from './action-check';



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

export type ReplayMap = Map<number, Action>;
export interface CurrentReplay extends Replay {
    testResults: Map<number, any>;
}

export class UpdateLoop {
    private _currentActionId = 0;
    private _activeBidsByType = {} as BidsByType;
    private readonly _bThreadMap = new BThreadMap<BThread>();
    private readonly _bThreadStateMap = new BThreadMap<BThreadState>();
    private readonly _bThreadBids: BThreadBids[] = [];
    private readonly _logger: Logger;
    private readonly _scaffold: (loopCount: number) => void;
    private readonly _eventCache = new EventMap<CachedItem<any>>();
    private readonly _getCachedItem: GetCachedItem = (eventId: EventId) => this._eventCache.get(eventId);
    private readonly _eventContexts = new EventMap<EventContext>();
    private readonly _singleActionDispatch: SingleActionDispatch;
    private readonly _testResults = new Map<number, any[]>();
    private _inReplay = false;
    private _replay?: CurrentReplay;
    private readonly _uiActionQueue: Action[] = [];     
    
    constructor(stagingFunction: StagingFunction, singleActionDispatch: SingleActionDispatch, logger: Logger) {
        this._logger = logger;
        this._scaffold = setupScaffolding(stagingFunction, this._bThreadMap, this._bThreadBids, this._bThreadStateMap, this._eventCache, singleActionDispatch, this._logger);
        this._singleActionDispatch = singleActionDispatch;
    }

    private _reset() {
        this._currentActionId = 0;
        this._uiActionQueue.length = 0;
        this._bThreadMap.forEach(bThread => bThread.destroy(true));
        this._bThreadMap.clear();
        this._eventCache.clear();
        this._testResults.clear();
        this._logger.resetLog();
    }

    private _getEventContext(event: string | EventId): EventContext {
        const eventId = toEventId(event);
        let context = this._eventContexts.get(eventId);
        if(context === undefined) {
            context = new EventContext(this._singleActionDispatch, eventId);
            this._eventContexts.set(eventId, context);
        }
        context?.update(this._activeBidsByType, this._getCachedItem, this._currentActionId);
        return context;
    }

    private _getNextReplayAction(actionId: number): ActionWithId | undefined {
        if(this._replay === undefined) return undefined
        const actions = this._replay.actions;
        if(actions.length > 0 && actions[0].id === actionId) {
            const action = this._replay.actions.shift()!;
            if(action.payload === GET_VALUE_FROM_BTHREAD) {
                action.payload = this._bThreadMap.get(action.bThreadId)?.currentBids?.request?.get(action.eventId)?.payload;
            }
            return action;
        }
        return undefined;
    }

    private _getContext(): ScenariosContext {
        this._inReplay = this._replay !== undefined && this._replay.actions.length > 0
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

    private _processPayload(action: Action): void {
        if(action.type === ActionType.requested) {
            if (typeof action.payload === "function") {
                action.payload = action.payload(this._eventCache.get(action.eventId)?.value);
            }
            if(utils.isThenable(action.payload) && action.resolveActionId === undefined) {
                action.resolveActionId = null;
            }
        }
    }

    private _setupContext(): ScenariosContext {
        if(this._inReplay) this._runContextTests();
        if(this.isPaused) return this._getContext();
        const requestingBids = getActiveBidsForSelectedTypes(this._activeBidsByType, [BidType.request, BidType.set, BidType.trigger]);
        let actionCheck: ActionCheck | undefined = undefined;        
        do {
            const action = this._getNextReplayAction(this._currentActionId) ||  this._uiActionQueue.shift() || getActionFromBid(requestingBids?.shift())
            if(action === undefined) return this._getContext();
            if (action.id === null) action.id = this._currentActionId;
            if (action.type === ActionType.requested) {
                actionCheck = checkRequestAction(this._bThreadMap, this._activeBidsByType, action);
                if(actionCheck === ActionCheck.OK) {
                    this._processPayload(action); //TODO: not sure if this should be done before logging. It could be a good idea to check 
                    this._logger.logAction(action as ActionWithId);
                    advanceRequestAction(this._bThreadMap, this._eventCache, this._activeBidsByType, action);
                }
            }
            else if (action.type === ActionType.uiDispatched) {
                actionCheck = checkUiAction(this._activeBidsByType, action);
                if(actionCheck === ActionCheck.OK) {
                    this._logger.logAction(action as ActionWithId);
                    advanceUiAction(this._bThreadMap, this._eventCache, this._activeBidsByType, action);
                }
            }
            else if (action.type === ActionType.resolved) {
                actionCheck = checkResolveAction(this._bThreadMap, action);
                if(actionCheck === ActionCheck.OK) {
                    this._logger.logAction(action as ActionWithId);
                    advanceResolveAction(this._bThreadMap, this._eventCache, this._activeBidsByType, action);
                }
            }
            else if (action.type === ActionType.rejected) {
                actionCheck = checkRejectAction(this._bThreadMap, action);
                if(actionCheck === ActionCheck.OK) {
                    this._logger.logAction(action as ActionWithId);
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

    public setUiActionQueue(actions: Action[]): void {
        this._uiActionQueue.length = 0;
        actions.forEach(action => this._uiActionQueue.push(action));
    }

    public runScaffolding(): ScenariosContext {
        this._scaffold(this._currentActionId);
        this._activeBidsByType = activeBidsByType(this._bThreadBids);
        return this._setupContext();
    }

    public startReplay(replay: Replay): ScenariosContext {
        this._replay = {...replay, testResults: new Map<number, any>()}
        this._inReplay = true;
        this._reset();
        return this.runScaffolding();
    }

    public togglePaused(): ScenariosContext {
        this.isPaused = !this.isPaused;
        return this.runScaffolding();
    }
}