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
import { ScenariosDispatch, SingleActionDispatch } from '.';
import { ScenariosContextTest } from './index';



// update loop
// -----------------------------------------------------------------------------------

export interface ScenariosContext {
    event: (eventName: string | EventId) => EventContext;
    thread: BThreadMap<BThreadState>;
    log: Logger;
    bids: BidsByType;
    debug: {
        inReplay: boolean;
        isPaused: boolean
    }
}
export type UpdateLoopFunction = () => ScenariosContext;
export type ReplayMap = Map<number, Action>;

export class UpdateLoop {
    private _currentActionId = 0;
    public isPaused = false;
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
    public readonly actionQueue: Action[] = [];
    public readonly replayMap = new Map<number, Action>();
    public readonly beforeActionTest = new Map<number, ScenariosContextTest>();
    

    constructor(stagingFunction: StagingFunction, singleActionDispatch: SingleActionDispatch) {
        this._logger = new Logger();
        this._scaffold = setupScaffolding(stagingFunction, this._bThreadMap, this._bThreadBids, this._bThreadStateMap, this._eventCache, singleActionDispatch, this._logger);
        this._singleActionDispatch = singleActionDispatch;
        // this.runScaffolding();
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
        if(this.replayMap.size !== 0) {
            if(this.replayMap.has(0)) actionId = 0;
            const action = this.replayMap.get(actionId);
            if(action === undefined) return undefined;
            this.replayMap.delete(actionId);
            if(action.payload === GET_VALUE_FROM_BTHREAD) {
                action.payload = this._bThreadMap.get(action.bThreadId)?.currentBids?.request?.get(action.eventId)?.payload;
            }
            return action;
        }
        return undefined;
    }

    public runScaffolding(): ScenariosContext {
        this._scaffold(this._currentActionId);
        this._activeBidsByType = activeBidsByType(this._bThreadBids);
        return this._setupContext();
    }

    public startReplay(): ScenariosContext {
        this._reset();
        return this.runScaffolding();
    }

    public togglePaused(): ScenariosContext {
        this.isPaused = !this.isPaused;
        return this.runScaffolding();
    }

    private _setupContext(): ScenariosContext {
        let action: undefined | Action;
        if(this.beforeActionTest)
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
        // return context to UI
        return { 
            event: this._getEventContext.bind(this),
            thread: this._bThreadStateMap,
            log: this._logger,
            bids: this._activeBidsByType,
            debug: {
                inReplay: this.replayMap.size > 0,
                isPaused: this.isPaused
            }
        }
    }
}