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
import { setupScaffolding, ActionDispatch, StagingFunction } from './scaffolding';



// update loop
// -----------------------------------------------------------------------------------

export interface ScenariosContext {
    event: (eventName: string | EventId) => EventContext;
    thread: BThreadMap<BThreadState>;
    log: Logger;
    bids: BidsByType;
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
    public readonly actionQueue: Action[] = [];
    public readonly replayMap = new Map<number, Action>();
    public readonly actionDispatch: ActionDispatch;

    constructor(stagingFunction: StagingFunction, actionDispatch: ActionDispatch) {
        this._logger = new Logger();
        this._scaffold = setupScaffolding(stagingFunction, this._bThreadMap, this._bThreadBids, this._bThreadStateMap, this._eventCache, actionDispatch, this._logger);
        this.actionDispatch = actionDispatch;
        this.runScaffolding();
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
            context = new EventContext(this.actionDispatch, eventId);
            this._eventContexts.set(eventId, context);
        }
        context?.update(this._activeBidsByType, this._getCachedItem, this._currentActionId);
        return context;
    }

    private _getNextReplayAction(actionId: number): Action | undefined {
        if(this.replayMap.size !== 0) {
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

    public runScaffolding() {
        this._scaffold(this._currentActionId);
        this._activeBidsByType = activeBidsByType(this._bThreadBids);
    }

    public setupContext(isPaused?: boolean): ScenariosContext {
        let action: undefined | Action;
        if(isPaused !== true) {
            action = this._getNextReplayAction(this._currentActionId) || 
                this.actionQueue.shift() || 
                getNextActionFromRequests(this._activeBidsByType);
        }
        if (action !== undefined) { // use next action
            if(action.id === 0) {
                this._reset();
                console.log('ACTION 0', action)
                this.runScaffolding();
            } else if(action.id === null) {
                action.id = this._currentActionId;
            }
            if(action.type === ActionType.requested) {
                if (typeof action.payload === "function") {
                    action.payload = action.payload(this._eventCache.get(action.eventId)?.value);
                }
                if(utils.isThenable(action.payload) && action.resolveActionId === undefined) {
                    action.resolveActionId = null;
                }
            }
            this._logger.logAction(action);
            advanceBThreads(this._bThreadMap, this._eventCache, this._activeBidsByType, action);
            this._currentActionId++;
            this.runScaffolding();
            return this.setupContext(isPaused);
        }
        // return context to UI
        return { 
            event: this._getEventContext.bind(this),
            thread: this._bThreadStateMap,
            log: this._logger,
            bids: this._activeBidsByType
        }
    }
}