import { Action, ActionType, getNextActionFromRequests } from './action';
import { Bid, BidType, BThreadBids, getAllBids, BidSubType } from './bid';
import { BThread, BThreadKey, BThreadState, GeneratorFn, BThreadInfo, PendingEventInfo, BThreadId } from './bthread';
import { EventMap, EventId, toEvent, EventKey } from './event-map';
import { CachedItem, EventCache } from './event-cache';
import { Logger } from './logger';
import { advanceBThreads } from './advance-bthreads';
import { EventContext, EventContextResult } from './event-context';
import { BThreadMap } from './bthread-map';

export type GetCachedItem = (event: EventId | string) => CachedItem<any> | undefined;
export type StagingFunction = (enable: ([bThreadInfo, generatorFn, props]: [BThreadInfo, GeneratorFn, any]) => BThreadState, cached: GetCachedItem) => void;
export type ActionDispatch = (action: Action) => void;

// enable, disable or delete bThreads
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

export interface ScaffoldingResult {
    bThreadBids: BThreadBids[];
    bThreadStateMap: BThreadMap<BThreadState>;
    allPending: EventMap<PendingEventInfo>;
}

function setupScaffolding(
    stagingFunction: StagingFunction,
    bThreadMap: BThreadMap<BThread>,
    eventCache: EventCache,
    dispatch: ActionDispatch
): () => ScaffoldingResult {
    const bids: BThreadBids[] = [];
    const allPending: EventMap<PendingEventInfo> = new EventMap();
    const enabledIds = new Set<string>();
    const destroyOnDisableThreadIds = new Set<string>();
    const cancelPendingOnDisableThreadIds = new Set<string>();
    const bThreadStateMap: BThreadMap<BThreadState> = new BThreadMap();

    function enableBThread([bThreadInfo, generatorFn, props]: [BThreadInfo, GeneratorFn, any]): BThreadState {
        const bThreadId: BThreadId = {name: bThreadInfo.name, key: bThreadInfo.key};
        const bThreadIdString = BThreadMap.toIdString({name: bThreadInfo.name, key: bThreadInfo.key})
        enabledIds.add(bThreadIdString);
        let bThread = bThreadMap.get(bThreadId)
        if (bThread) {
            bThread.resetOnPropsChange(props);
        } else {
            bThreadMap.set(bThreadId, new BThread(bThreadId, bThreadInfo, generatorFn, props, dispatch));
            if(bThreadInfo.destroyOnDisable) destroyOnDisableThreadIds.add(bThreadIdString);
            if(bThreadInfo.cancelPendingOnDisable) cancelPendingOnDisableThreadIds.add(bThreadIdString);
        }
        bThread = bThreadMap.get(bThreadId);
        if(bThread!.currentBids) bids.push(bThread!.currentBids);
        allPending.merge(bThread!.state.pendingEvents);
        bThreadStateMap.set(bThreadId, bThread!.state);
        return bThread!.state;
    }
    function getCached<T>(event: EventId | string): CachedItem<T> {
        event = toEvent(event);
        return eventCache.get(event)!;
    }
    function run() {
        bids.length = 0;
        allPending.clear();
        enabledIds.clear();
        stagingFunction(enableBThread, getCached);
        if(cancelPendingOnDisableThreadIds.size > 0) {
            cancelPendingOnDisableThreadIds.forEach(idString => {
                if(!enabledIds.has(idString)) {
                    const bThreadId = BThreadMap.toThreadId(idString);
                    bThreadMap.get(bThreadId)?.cancelPending();
                }
            });
        }
        if(destroyOnDisableThreadIds.size > 0) 
            destroyOnDisableThreadIds.forEach(idString => {
            if(!enabledIds.has(idString)) {
                const bThreadId = BThreadMap.toThreadId(idString);
                bThreadMap.get(bThreadId)?.destroy();
                bThreadMap.delete(bThreadId);
                bThreadStateMap.delete(bThreadId);
                cancelPendingOnDisableThreadIds.delete(idString);
                destroyOnDisableThreadIds.delete(idString);
            }
        });
        return {
            bThreadBids: bids,
            bThreadStateMap: bThreadStateMap,
            allPending: allPending
        };
    }
    return run;
}

// update loop ( central construct )
// -----------------------------------------------------------------------------------

export interface ScenariosContext {
    event: (eventName: string, eventKey?: string | number | undefined) => EventContextResult;
    thread: BThreadMap<BThreadState>;
    actionLog: Action[];
}
export type UpdateLoopFunction = () => ScenariosContext;
export type ReplayMap = Map<number, Action>;

export class UpdateLoop {
    readonly bThreadMap: BThreadMap<BThread>;
    readonly eventCache: EventCache;
    readonly logger: Logger;
    readonly scaffold: () => ScaffoldingResult;
    readonly getEventCache: GetCachedItem;
    readonly eventContext: EventContext;
    private _actionIndex = 0;
    public actionQueue: Action[] = [];
    public replayMap = new Map<number, Action>();
    public actionDispatch: ActionDispatch;

    constructor(stagingFunction: StagingFunction, actionDispatch: ActionDispatch) {
        this.bThreadMap = new BThreadMap();
        this.logger = new Logger();
        this.eventCache = new EventMap();
        this.scaffold = setupScaffolding(stagingFunction, this.bThreadMap, this.eventCache, actionDispatch);
        this.actionDispatch = actionDispatch;
        this.getEventCache = (event: EventId | string) => this.eventCache.get(toEvent(event));
        this.eventContext = new EventContext(this.getEventCache);
    }

    private _startReplay() {
        this._actionIndex = 0;
        this.actionQueue.length = 0;
        this.bThreadMap.forEach(bThread => { 
            bThread.destroy();
        });
        this.bThreadMap.clear();
        this.eventCache.clear();
    }

    public runLoop(): ScenariosContext {
        // setup
        if(this.replayMap.has(0)) this._startReplay();
        const { bThreadBids, bThreadStateMap, allPending } = this.scaffold();
        const bids = getAllBids(bThreadBids, allPending);
        // get next action
        let action: Action | undefined;
        if(this.replayMap.size !== 0) {
            action = this.replayMap.get(this._actionIndex);
            this.replayMap.delete(this._actionIndex);
            if(action?.type === ActionType.requested && action.payload === undefined) {
                action.payload = this.bThreadMap.get(action.bThreadId)?.currentBids?.request?.get(action.event)?.payload;
            }
        } else {
            action = this.actionQueue.shift() || getNextActionFromRequests(bids.request, bids.wait);
            if(action) {
                action.index = this._actionIndex;
                this.logger.logAction(action);
            }
        }
        if (action) { // use next action
            this._actionIndex++;
            advanceBThreads(this.bThreadMap, this.eventCache, bids, action);
            return this.runLoop();
        }
        // return to UI
        const dispatchAbleWaits = bids.wait?.filter(bids => !bids.every(bid => bid.subType === BidSubType.on))
        const getEvent = (eventName: string, eventKey?: string | number) => this.eventContext.getContext(this.actionDispatch, eventName, eventKey, dispatchAbleWaits, bids.block, allPending)
        return { 
            event: getEvent,
            thread: bThreadStateMap,
            actionLog: this.logger.actions
        }
    }
}