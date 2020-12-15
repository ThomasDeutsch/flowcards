import { Action, getNextActionFromRequests, ActionType, GET_VALUE_FROM_BTHREAD } from './action';
import { BThreadBids, activeBidsByType, BidsByType } from './bid';
import { BThread, BThreadState } from './bthread';
import { EventMap, EventId, toEventId } from './event-map';
import { CachedItem, GetCachedItem } from './event-cache';
import { Logger } from './logger';
import { advanceBThreads } from './advance-bthreads';
import { EventContext } from './event-context';
import { BThreadMap } from './bthread-map';
import * as utils from './utils';
import { setupScaffolding, StagingFunction } from './scaffolding';
import { ContextTest, SingleActionDispatch, ScenariosReplayAction } from './index';



// update loop
// -----------------------------------------------------------------------------------

export interface ScenariosContext {
    event: (eventName: string | EventId) => EventContext;
    thread: BThreadMap<BThreadState>;
    log: Logger;
    bids: BidsByType;
    debug: {
        inReplay: boolean;
        isPaused: boolean;
        testResults: Map<number, any>;  // TODO: replace any with a defined type
    }
}
export type UpdateLoopFunction = () => ScenariosContext;
export type ReplayMap = Map<number, Action>;

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
    private readonly _contextTests = new Map<number, ContextTest[]>();
    private readonly _testResults = new Map<number, any[]>();
    private readonly _replayMap = new Map<number, Action>();
    

    constructor(stagingFunction: StagingFunction, singleActionDispatch: SingleActionDispatch) {
        this._logger = new Logger();
        this._scaffold = setupScaffolding(stagingFunction, this._bThreadMap, this._bThreadBids, this._bThreadStateMap, this._eventCache, singleActionDispatch, this._logger);
        this._singleActionDispatch = singleActionDispatch;
    }

    private _reset() {
        this._currentActionId = 0;
        this.actionQueue.length = 0;
        this._bThreadMap.forEach(bThread => bThread.destroy(true));
        this._bThreadMap.clear();
        this._eventCache.clear();
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

    private _getNextReplayAction(actionId: number): Action | undefined {
        if(this._replayMap.size !== 0) {
            if(this._replayMap.has(0)) actionId = 0;
            const action = this._replayMap.get(actionId);
            if(action === undefined) return undefined;
            this._replayMap.delete(actionId);
            if(action.payload === GET_VALUE_FROM_BTHREAD) {
                action.payload = this._bThreadMap.get(action.bThreadId)?.currentBids?.request?.get(action.eventId)?.payload;
            }
            return action;
        }
        return undefined;
    }

    private _getContext(): ScenariosContext {
        return { 
            event: this._getEventContext.bind(this),
            thread: this._bThreadStateMap,
            log: this._logger,
            bids: this._activeBidsByType,
            debug: {
                inReplay: this._replayMap.size > 0,
                isPaused: this.isPaused,
                testResults: this._testResults
            }
        }
    }

    private _runTests(): void {
        const tests = this._contextTests.get(this._currentActionId);
        if(tests === undefined || tests.length === 0) return;
        try {
            tests.forEach(scenarioTest => scenarioTest(this._getContext()));
        } catch(error) {
            this.isPaused = true;
            this._testResults.set(this._currentActionId, error);
            console.log('ERROR_UPDATER: ', error);
        }
    }

    private _setupContext(): ScenariosContext {
        let action: undefined | Action;
        this._runTests();
        if(this.isPaused === false) {
            action = this._getNextReplayAction(this._currentActionId)
                || this.actionQueue.shift() || 
                getNextActionFromRequests(this._activeBidsByType);
        }
        if (action !== undefined) { // use next action
            if(action.id === null) {
                action.id = this._currentActionId;
            }
            if(action.type === ActionType.request) {
                if (typeof action.payload === "function") {
                    action.payload = action.payload(this._eventCache.get(action.eventId)?.value);
                }
                if(utils.isThenable(action.payload) && action.resolveActionId === undefined) {
                    action.resolveActionId = null;
                }
            }
            this._logger.logAction(action);
            const actionResult = advanceBThreads(this._bThreadMap, this._eventCache, this._activeBidsByType, action);
            this._logger.logActionResult(actionResult);
            this._currentActionId++;
            this._logger.logPending(this._activeBidsByType.pending);
            return this.runScaffolding();
        }
        return this._getContext();
    }

    // public ----------------------------------------------------------------------
    public isPaused = false;
    public readonly actionQueue: Action[] = []; // TODO: check if it would be a good idea to make this private


    public setContextTests(testMap?: Map<number, ContextTest[]>): void {
        this._contextTests.clear();
        testMap?.forEach((tests, actionId) => this._contextTests.set(actionId, tests));
    }

    public runScaffolding(): ScenariosContext {
        this._scaffold(this._currentActionId);
        this._activeBidsByType = activeBidsByType(this._bThreadBids);
        return this._setupContext();
    }

    public startReplay(replayAction: ScenariosReplayAction): ScenariosContext {
        this._replayMap.clear();
        this._testResults.clear();
        replayAction.actions.forEach(action => this._replayMap.set(action.id, action));
        replayAction.tests?.forEach((tests, actionId) => this._contextTests.set(actionId, [...tests]));
        this._reset();
        return this.runScaffolding();
    }

    public togglePaused(): ScenariosContext {
        this.isPaused = !this.isPaused;
        return this.runScaffolding();
    }
}