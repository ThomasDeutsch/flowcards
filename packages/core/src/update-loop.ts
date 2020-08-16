import { Action, ActionType, getNextActionFromRequests } from './action';
import { AllBidsByType, Bid, BidSubType, BidType, BThreadBids, getAllBids, getMatchingBids } from './bid';
import { BThread, BThreadKey, BThreadState, GeneratorFn, BThreadInfo, PendingEventInfo } from './bthread';
import { EventMap, FCEvent, toEvent } from './event';
import { CachedItem, EventCache } from './event-cache';
import { EventDispatch, setupEventDispatcher } from './event-dispatcher';
import { Logger, Reaction } from './logger';
import * as utils from './utils';
import { explain, EventInfo } from './guard';

type GetCachedItem = (event: FCEvent | string) => CachedItem<any> | undefined;
export type StagingFunction = (enable: ([bThreadInfo, generatorFn, props]: [BThreadInfo, GeneratorFn, any]) => BThreadState, cached: GetCachedItem) => void;
export type ActionDispatch = (action: Action) => void;

function createBThreadId(id: string, key?: BThreadKey): string {
    return key || key === 0 ? `${id}_${key.toString()}` : id;
}


// advance threads, based on selected action
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

function advanceWaits(allBids: AllBidsByType, bThreadDictionary: Record<string, BThread>, action: Action): boolean {
    const bids = (getMatchingBids(allBids[BidType.wait], action.event) || []).filter(event => event.subType && event.subType !== BidSubType.onPending);
    if(bids.length === 0) return false;
    bids.forEach(bid => {
        bThreadDictionary[bid.threadId].progressWait(bid, action.payload);
    });
    return true;
}

function advanceOnPending(allBids: AllBidsByType, bThreadDictionary: Record<string, BThread>, action: Action): boolean {
    const bids = (getMatchingBids(allBids[BidType.wait], action.event) || []).filter(bid => bid.subType === BidSubType.onPending);
    if(bids.length === 0) return false;
    bids.forEach(bid => {
        bThreadDictionary[bid.threadId].progressWait(bid, action.payload);
    });
    return true;
}

function extendAction(allBids: AllBidsByType, bThreadDictionary: Record<string, BThread>, action: Action): boolean {
    const bids = getMatchingBids(allBids[BidType.extend], action.event);
    while(bids && bids.length > 0) {
        const bid = bids.pop(); // get last bid ( highest priority )
        if(bid === undefined) continue;
        const extendPromise = bThreadDictionary[bid.threadId].progressExtend(action, bid);
        if(extendPromise) {
            action.payload = extendPromise;
            bThreadDictionary[action.threadId || bid.threadId].addPendingRequest(action, bid); // use the bid.threadId, if this action was not a request
            advanceOnPending(allBids, bThreadDictionary, action);
            return true;
        }
    }
    return false;
}

function advanceBThreads(bThreadDictionary: Record<string, BThread>, eventCache: EventCache, allBids: AllBidsByType, action: Action): void {
    switch (action.type) {
        case ActionType.requested: {
            const bid = bThreadDictionary[action.threadId].currentBids?.request?.get(action.event);
            if(bid === undefined) return;
            if (typeof action.payload === "function") {
                action.payload = action.payload(eventCache.get(action.event)?.value);
            }
            if(utils.isThenable(action.payload)) {
                bThreadDictionary[action.threadId].addPendingRequest(action, bid);
                advanceOnPending(allBids, bThreadDictionary, action);
                return;
            }
            if(extendAction(allBids, bThreadDictionary, action)) return;
            bThreadDictionary[action.threadId].progressRequest(eventCache, action.event, action.payload); // request got resolved
            advanceWaits(allBids, bThreadDictionary, action);
            return;
        }
        case ActionType.dispatched: {
            if(extendAction(allBids, bThreadDictionary, action)) return;
            const isValidDispatch = advanceWaits(allBids, bThreadDictionary, action);
            if(!isValidDispatch) console.warn('action was not waited for: ', action.event.name);
            return;
        }
        case ActionType.resolved: {
            if(bThreadDictionary[action.threadId]) {
                const isResolved = bThreadDictionary[action.threadId].resolvePending(action);
                if(isResolved === false) return;
            }
            if(extendAction(allBids, bThreadDictionary, action)) return;
            bThreadDictionary[action.threadId].progressRequest(eventCache, action.event, action.payload); // request got resolved
            advanceWaits(allBids, bThreadDictionary, action);
            return;
        }
        case ActionType.rejected: {
            if(bThreadDictionary[action.threadId]) {
                bThreadDictionary[action.threadId].rejectPending(action);
            }
        }
    }
}

// enable, disable or delete bThreads
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

export interface ScaffoldingResult {
    bThreadBids: BThreadBids[];
    bThreadStateById: Record<string, BThreadState>;
    allPending: EventMap<PendingEventInfo>;
}

function setupScaffolding(
    stagingFunction: StagingFunction,
    bThreadDictionary: Record<string, BThread>,
    eventCache: EventCache,
    dispatch: ActionDispatch,
    logger?: Logger
): () => ScaffoldingResult {
    const bids: BThreadBids[] = [];
    const allPending: EventMap<PendingEventInfo> = new EventMap();
    const enabledIds = new Set<string>();
    const destroyOnDisableThreadIds = new Set<string>();
    let bThreadStateById: Record<string, BThreadState>;
    function enableBThread([bThreadInfo, generatorFn, props]: [BThreadInfo, GeneratorFn, any]): BThreadState {
        bThreadInfo.id = createBThreadId(bThreadInfo.id, bThreadInfo.key);
        enabledIds.add(bThreadInfo.id);
        if (bThreadDictionary[bThreadInfo.id]) {
            bThreadDictionary[bThreadInfo.id].resetOnPropsChange(props);
        } else {
            if(bThreadInfo.destroyOnDisable) destroyOnDisableThreadIds.add(bThreadInfo.id);
            bThreadDictionary[bThreadInfo.id] = new BThread(bThreadInfo, generatorFn, props, dispatch, logger);
        }
        const bThreadBids = bThreadDictionary[bThreadInfo.id].currentBids;
        if(bThreadBids) bids.push(bThreadBids);
        allPending.merge(bThreadDictionary[bThreadInfo.id].pending);
        bThreadStateById[bThreadInfo.id] = bThreadDictionary[bThreadInfo.id].state;
        return bThreadDictionary[bThreadInfo.id].state;
    }
    function getCached<T>(event: FCEvent | string): CachedItem<T> {
        event = toEvent(event);
        return eventCache.get(event)!;
    }
    function run() {
        bThreadStateById = {};
        enabledIds.clear();
        bids.length = 0;
        allPending.clear();
        stagingFunction(enableBThread, getCached);

        if(destroyOnDisableThreadIds.size > 0) 
            destroyOnDisableThreadIds.forEach(id => {
            if(!enabledIds.has(id)) {
                destroyOnDisableThreadIds.delete(id);
                bThreadDictionary[id].destroy();
                delete bThreadDictionary[id];
            }
        });
        return {
            bThreadBids: bids,
            bThreadStateById: bThreadStateById,
            allPending: allPending
        };
    }
    return run;
}

// update loop ( central construct )
// -----------------------------------------------------------------------------------

export interface ScenariosContext {
    dispatch: EventDispatch;
    getEventInfo: (event: string | FCEvent, payload: any) => EventInfo[];
    event: GetCachedItem;
    pending: EventMap<PendingEventInfo>;
    blocks: EventMap<Bid[]>;
    state: Record<string, BThreadState>;
    log?: [Action[], Map<string, Reaction>[]];
}
export type UpdateLoopFunction = () => ScenariosContext;
export type ReplayMap = Map<number, Action>;

export function createUpdateLoop(stagingFunction: StagingFunction, actionDispatch: ActionDispatch, disableLogging?: boolean): [UpdateLoopFunction, EventDispatch, Action[], ReplayMap, ActionDispatch] {
    const bThreadDictionary: Record<string, BThread> = {};
    const eventCache: EventCache = new EventMap();
    const logger = disableLogging ? undefined : new Logger();
    const scaffold = setupScaffolding(stagingFunction, bThreadDictionary, eventCache, actionDispatch, logger);
    const [updateEventDispatcher, eventDispatch] = setupEventDispatcher(actionDispatch);
    const getEventCache: GetCachedItem = (event: FCEvent | string) => eventCache.get(toEvent(event));
    let actionIndex = 0;
    const actionQueue: Action[] = [];
    const replayMap = new Map<number, Action>();
    const startReplay = () => {
        actionIndex = 0;
        actionQueue.length = 0;
        // delete all BThreads
        Object.keys(bThreadDictionary).forEach((threadId): void => { 
            bThreadDictionary[threadId].destroy();
            delete bThreadDictionary[threadId];
        });
        eventCache.clear();
    }
    // main loop-function
    function updateLoop(): ScenariosContext {
        // setup
        if(replayMap.has(0)) startReplay();
        const { bThreadBids, bThreadStateById, allPending } = scaffold();
        const bids = getAllBids(bThreadBids, allPending);
        // get next action
        let action: Action | undefined;
        if(replayMap.size !== 0) {
            action = replayMap.get(actionIndex);
            replayMap.delete(actionIndex);
            if(action?.type === ActionType.requested && action.payload === undefined) {
                action.payload = bThreadDictionary[action.threadId].currentBids?.request?.get(action.event)?.payload;
            }
        } else {
            action = actionQueue.shift() || getNextActionFromRequests(bids.request, bids.wait);
            if(action) {
                action.index = actionIndex;
                logger?.logAction(action);
            }
        }
        if (action) { // use next action
            actionIndex++;
            bids.wait?.without(bids.block); // TODO: do i need to remove all matchin events instead??? same problem in explain and mergeBids!!!!
            advanceBThreads(bThreadDictionary, eventCache, bids, action);
            return updateLoop();
        }
        // return to UI
        updateEventDispatcher(allPending, bids[BidType.block], bids[BidType.wait]);
        return { 
            dispatch: eventDispatch,
            getEventInfo: (event: string | FCEvent, payload: any) => explain(bids[BidType.wait], bids[BidType.block], allPending, toEvent(event), payload),
            event: getEventCache,
            blocks: bids[BidType.block] || new EventMap(),
            pending: allPending,
            state: bThreadStateById,
            log: logger ? [logger.actions, logger.reactions] : undefined
        }
    }
    return [updateLoop, eventDispatch, actionQueue, replayMap, actionDispatch];
}