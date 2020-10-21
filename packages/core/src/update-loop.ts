import { Action, getNextActionFromRequests, ActionType, GET_VALUE_FROM_BTHREAD } from './action';
import { BThreadBids, activeBidsByType, BidsByType } from './bid';
import { BThread, BThreadState, GeneratorFn, BThreadInfo, BThreadId } from './bthread';
import { EventMap, EventId, toEventId } from './event-map';
import { CachedItem, GetCachedItem } from './event-cache';
import { ActionLog } from './action-log';
import { advanceBThreads } from './advance-bthreads';
import { EventContext } from './event-context';
import { BThreadMap } from './bthread-map';
import * as utils from './utils';

export type StagingFunction = (enable: ([bThreadInfo, generatorFn, props]: [BThreadInfo, GeneratorFn, any]) => BThreadState, cached: GetCachedItem) => void;
export type ActionDispatch = (action: Action) => void;

// enable, disable or delete bThreads
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
function setupScaffolding(
    stagingFunction: StagingFunction,
    bThreadMap: BThreadMap<BThread>,
    bThreadBids: BThreadBids[],
    bThreadStateMap: BThreadMap<BThreadState>,
    eventCache: EventMap<CachedItem<any>>,
    dispatch: ActionDispatch,
    actionLog: ActionLog
): (currentActionId: number) => void {
    const enabledBThreadIds = new Set<string>();
    const destroyOnDisableThreadIds = new Set<string>();
    const cancelPendingOnDisableThreadIds = new Set<string>();
    let bThreadOrderIndex = 0;

    function enableBThread([bThreadInfo, generatorFn, props]: [BThreadInfo, GeneratorFn, any]): BThreadState {
        const bThreadId: BThreadId = {name: bThreadInfo.name, key: bThreadInfo.key};
        const bThreadIdString = BThreadMap.toIdString(bThreadId);
        enabledBThreadIds.add(bThreadIdString);
        let bThread = bThreadMap.get(bThreadId)
        if (bThread) {
            bThread.resetOnPropsChange(props);
        } else {
            bThreadMap.set(bThreadId, new BThread(bThreadId, bThreadInfo, generatorFn, props, dispatch, actionLog));
            if(bThreadInfo.destroyOnDisable) destroyOnDisableThreadIds.add(bThreadIdString);
            if(bThreadInfo.cancelPendingOnDisable) cancelPendingOnDisableThreadIds.add(bThreadIdString);
        }
        bThread = bThreadMap.get(bThreadId)!;
        bThread.orderIndex = bThreadOrderIndex++;
        if(bThread.currentBids) bThreadBids.push(bThread.currentBids);
        bThreadStateMap.set(bThreadId, bThread.state);
        return bThread.state;
    }
    function getCached<T>(event: EventId | string): CachedItem<T> {
        event = toEventId(event);
        return eventCache.get(event)!;
    }
    function scaffold(currentActionId: number) {
        bThreadBids.length = 0;
        bThreadOrderIndex = 0;
        enabledBThreadIds.clear();
        stagingFunction(enableBThread, getCached); // do the staging
        if(cancelPendingOnDisableThreadIds.size > 0) {
            cancelPendingOnDisableThreadIds.forEach(bThreadIdString => {
                if(!enabledBThreadIds.has(bThreadIdString)) {
                    bThreadMap.get(BThreadMap.toThreadId(bThreadIdString))?.cancelPending();
                }
            });
        }
        if(destroyOnDisableThreadIds.size > 0) 
            destroyOnDisableThreadIds.forEach(bThreadIdString => {
            if(!enabledBThreadIds.has(bThreadIdString)) {
                bThreadMap.get(BThreadMap.toThreadId(bThreadIdString))?.destroy();
                const bThreadId = BThreadMap.toThreadId(bThreadIdString);
                bThreadMap.delete(bThreadId);
                bThreadStateMap.delete(bThreadId);
                cancelPendingOnDisableThreadIds.delete(bThreadIdString);
                destroyOnDisableThreadIds.delete(bThreadIdString);
            }
        });
        actionLog.logEnabledBThreadIds(currentActionId, [...enabledBThreadIds])
    }
    return scaffold;
}

// update loop
// -----------------------------------------------------------------------------------

export interface ScenariosContext {
    event: (eventName: string | EventId) => EventContext;
    thread: BThreadMap<BThreadState>;
    log: ActionLog;
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
    private readonly _actionLog: ActionLog;
    private readonly _scaffold: (loopCount: number) => void;
    private readonly _eventCache = new EventMap<CachedItem<any>>();
    private readonly _getCachedItem: GetCachedItem = (eventId: EventId) => this._eventCache.get(eventId);
    private readonly _eventContexts = new EventMap<EventContext>();
    public readonly actionQueue: Action[] = [];
    public readonly replayMap = new Map<number, Action>();
    public readonly actionDispatch: ActionDispatch;

    constructor(stagingFunction: StagingFunction, actionDispatch: ActionDispatch) {
        this._actionLog = new ActionLog();
        this._scaffold = setupScaffolding(stagingFunction, this._bThreadMap, this._bThreadBids, this._bThreadStateMap, this._eventCache, actionDispatch, this._actionLog);
        this.actionDispatch = actionDispatch;
        this.runScaffolding();
    }

    private _reset() {
        this._currentActionId = 0;
        this.actionQueue.length = 0;
        this._bThreadMap.forEach(bThread => bThread.destroy());
        this._bThreadMap.clear();
        this._eventCache.clear();
        this._actionLog.resetLog();
    }

    private _getEventContext = (event: string | EventId): EventContext => {
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
            this._actionLog.logAction(action);
            advanceBThreads(this._bThreadMap, this._eventCache, this._activeBidsByType, action);
            this.runScaffolding();
            this._currentActionId++;
            return this.setupContext(isPaused);
        }
        // return context to UI
        return { 
            event: this._getEventContext,
            thread: this._bThreadStateMap,
            log: this._actionLog,
            bids: this._activeBidsByType
        }
    }
}