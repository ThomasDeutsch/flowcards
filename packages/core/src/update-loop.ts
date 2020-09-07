import { Action, ActionType, getNextActionFromRequests } from './action';
import { BThreadBids, getAllBids, BidSubType, AllBidsByType } from './bid';
import { BThread, BThreadState, GeneratorFn, BThreadInfo, PendingEventInfo, BThreadId } from './bthread';
import { EventMap, EventId, toEvent, EventKey } from './event-map';
import { CachedItem, GetCachedItem } from './event-cache';
import { ActionLog } from './action-log';
import { advanceBThreads } from './advance-bthreads';
import { EventContext } from './event-context';
import { BThreadMap } from './bthread-map';

export type StagingFunction = (enable: ([bThreadInfo, generatorFn, props]: [BThreadInfo, GeneratorFn, any]) => BThreadState, cached: GetCachedItem) => void;
export type ActionDispatch = (action: Action) => void;

// enable, disable or delete bThreads
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

function setupScaffolding(
    stagingFunction: StagingFunction,
    bThreadMap: BThreadMap<BThread>,
    bThreadBids: BThreadBids[],
    pendingEventMap: EventMap<PendingEventInfo>,
    bThreadStateMap: BThreadMap<BThreadState>,
    eventCache: EventMap<CachedItem<any>>,
    dispatch: ActionDispatch,
    actionLog: ActionLog
): () => void {
    const enabledBThreadIds = new Set<string>();
    const destroyOnDisableThreadIds = new Set<string>();
    const cancelPendingOnDisableThreadIds = new Set<string>();

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
            // log create
        }
        bThread = bThreadMap.get(bThreadId)!;
        if(bThread.currentBids) bThreadBids.push(bThread.currentBids);
        pendingEventMap.merge(bThread.state.pendingEvents);
        bThreadStateMap.set(bThreadId, bThread.state);
        return bThread.state;
    }
    function getCached<T>(event: EventId | string): CachedItem<T> {
        event = toEvent(event);
        return eventCache.get(event)!;
    }
    function run() {
        bThreadBids.length = 0;
        pendingEventMap.clear();
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
                const bThradId = BThreadMap.toThreadId(bThreadIdString);
                bThreadMap.delete(bThradId);
                bThreadStateMap.delete(bThradId);
                cancelPendingOnDisableThreadIds.delete(bThreadIdString);
                destroyOnDisableThreadIds.delete(bThreadIdString);
                // log delete
            }
        });
    }
    return run;
}

// update loop ( central construct )
// -----------------------------------------------------------------------------------

export interface ScenariosContext {
    event: (eventName: string, eventKey?: string | number | undefined) => EventContext;
    thread: BThreadMap<BThreadState>;
    actionLog: Action[];
}
export type UpdateLoopFunction = () => ScenariosContext;
export type ReplayMap = Map<number, Action>;

export class UpdateLoop {
    private _loopCount = 0;
    private _allBidsByType: AllBidsByType = {};
    private readonly _bThreadMap = new BThreadMap<BThread>();
    private readonly _bThreadStateMap = new BThreadMap<BThreadState>();
    private readonly _bThreadBids: BThreadBids[] = [];
    private readonly _pendingEventMap = new EventMap<PendingEventInfo>();
    private readonly _actionLog = new ActionLog();
    private readonly _scaffold: () => void;
    private readonly _eventCache = new EventMap<CachedItem<any>>();
    private readonly _getCachedItem: GetCachedItem = (eventId: EventId) => this._eventCache.get(eventId);
    private readonly _eventContexts = new EventMap<EventContext>();
    public readonly actionQueue: Action[] = [];
    public readonly replayMap = new Map<number, Action>();
    public readonly actionDispatch: ActionDispatch;

    constructor(stagingFunction: StagingFunction, actionDispatch: ActionDispatch) {
        this._scaffold = setupScaffolding(stagingFunction, this._bThreadMap, this._bThreadBids, this._pendingEventMap, this._bThreadStateMap, this._eventCache, actionDispatch, this._actionLog);
        this.actionDispatch = actionDispatch;
    }

    private _startReplay() {
        this._loopCount = 0;
        this.actionQueue.length = 0;
        this._bThreadMap.forEach(bThread => { 
            bThread.destroy();
        });
        this._bThreadMap.clear();
        this._eventCache.clear();
    }

    private _getEventContext = (eventName: string, eventKey?: string | number): EventContext => {
        let context = this._eventContexts.get({name: eventName, key: eventKey});
        if(!context) {
            context = new EventContext(this.actionDispatch, {name: eventName, key: eventKey});
            this._eventContexts.set({name: eventName, key: eventKey}, context);
        }
        context?.update(this._allBidsByType, this._pendingEventMap, this._getCachedItem, this._loopCount);
        return context;
    }

    public setupContext(): ScenariosContext {
        // setup
        if(this.replayMap.has(0)) this._startReplay();
        this._scaffold();
        this._allBidsByType = getAllBids(this._bThreadBids, this._pendingEventMap);
        // get next action
        let action: Action | undefined;
        if(this.replayMap.size !== 0) {
            action = this.replayMap.get(this._loopCount);
            this.replayMap.delete(this._loopCount);
            if(action?.type === ActionType.requested && action.payload === undefined) {
                action.payload = this._bThreadMap.get(action.bThreadId)?.currentBids?.request?.get(action.event)?.payload;
            }
        } else {
            action = this.actionQueue.shift() || getNextActionFromRequests(this._allBidsByType.request, this._allBidsByType.wait);
            if(action) {
                action.loopIndex = this._loopCount;
                this._actionLog.logAction(action);
            }
        }
        if (action) { // use next action
            advanceBThreads(this._bThreadMap, this._eventCache, this._allBidsByType, action);
            this._loopCount++;
            return this.setupContext();
        }
        // return to UI
        return { 
            event: this._getEventContext,
            thread: this._bThreadStateMap,
            actionLog: this._actionLog.actions
        }
    }
}
