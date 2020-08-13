import { Action, ActionType, getNextActionFromRequests } from './action';
import {
    AllBidsByType, Bid, BidSubType, BidType, BThreadBids, getAllBids, getMatchingBids,
    PendingEventInfo
} from './bid';
import { BThread, BThreadKey, BThreadState } from './bthread';
import { EventMap, FCEvent, toEvent } from './event';
import { CachedItem, EventCache } from './event-cache';
import { EventDispatch, setupEventDispatcher } from './event-dispatcher';
import { FlowContext } from './flow';
import { Log, Logger } from './logger';
import * as utils from './utils';
import { getAllPendingEvents } from './bid';

type EnableThread = ({id, title, gen, props, key}: FlowContext) => BThreadState;
type GetCachedItem = (event: FCEvent | string) => CachedItem<any> | undefined;
export type StagingFunction = (enable: EnableThread, cached: GetCachedItem) => void;
export type ActionDispatch = (action: Action) => void;


export interface BThreadDictionary {
    [Key: string]: BThread;
}

function createBThreadId(id: string, key?: BThreadKey): string {
    return key || key === 0 ? `${id}_${key.toString()}` : id;
}


function advanceWaits(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, action: Action): boolean {
    const bids = (getMatchingBids(allBids[BidType.wait], action.event) || []).filter(event => event.subType && event.subType !== BidSubType.onPending);
    if(bids.length === 0) return false;
    bids.forEach(bid => {
        bThreadDictionary[bid.threadId].progressWait(bid, action.payload);
    });
    return true;
}

function advanceOnPending(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, action: Action): boolean {
    const bids = (getMatchingBids(allBids[BidType.wait], action.event) || []).filter(bid => bid.subType === BidSubType.onPending);
    if(bids.length === 0) return false;
    bids.forEach(bid => {
        bThreadDictionary[bid.threadId].progressWait(bid, action.payload);
    });
    return true;
}

function extendAction(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, action: Action): Action | undefined {
    const bids = getMatchingBids(allBids[BidType.extend], action.event);
    while(bids && bids.length > 0) {
        const bid = bids.pop(); // get last bid ( highest priority )
        if(bid === undefined) continue;
        const extendPromise = bThreadDictionary[bid.threadId].progressExtend(action, bid);
        if(extendPromise) {
            action.payload = extendPromise;
            action.extendedByThreadId = bid.threadId;
            bThreadDictionary[action.threadId].addPendingRequest(action);
            return undefined;
        }
    } 
    return action;
}


function advanceBThreads(bThreadDictionary: BThreadDictionary, eventCache: EventCache, allBids: AllBidsByType, action: Action): void {
    switch (action.type) {
        case ActionType.requested: {
            if (typeof action.payload === "function") {
                action.payload = action.payload(eventCache.get(action.event)?.value);
            }
            if(utils.isThenable(action.payload)) {
                bThreadDictionary[action.threadId].addPendingRequest(action);
                advanceOnPending(allBids, bThreadDictionary, action);
                break;
            }
            const nextAction = extendAction(allBids, bThreadDictionary, action);
            if(!nextAction) return; // was extended
            bThreadDictionary[nextAction.threadId].progressRequest(eventCache, nextAction.event, nextAction.payload); // request got resolved
            advanceWaits(allBids, bThreadDictionary, nextAction);
            break;
        }
        case ActionType.dispatched: {
            const nextAction = extendAction(allBids, bThreadDictionary, action);
            if(!nextAction) return; // was extended
            const isValidDispatch = advanceWaits(allBids, bThreadDictionary, nextAction);
            if(!isValidDispatch) console.warn('action was not waited for: ', action.event.name);
            break;
        }
        case ActionType.resolved: {
            if(bThreadDictionary[action.threadId]) {
                const isResolved = bThreadDictionary[action.threadId].resolvePending(action);
                if(isResolved === false) return;
            }
            const nextAction = extendAction(allBids, bThreadDictionary, action);
            if(!nextAction) return; // was extended
            bThreadDictionary[action.threadId].progressRequest(eventCache, nextAction.event, nextAction.payload); // request got resolved
            advanceWaits(allBids, bThreadDictionary, nextAction);
            break;
        }
        case ActionType.rejected: {
            if(bThreadDictionary[action.threadId]) {
                bThreadDictionary[action.threadId].rejectPending(action);
            }
        }
    }
}


export interface ScaffoldingResult {
    bThreadBids: BThreadBids[];
    bThreadStateById: Record<string, BThreadState>;
}

function setupScaffolding(
    stagingFunction: StagingFunction,
    bThreadDictionary: BThreadDictionary,
    eventCache: EventCache,
    dispatch: ActionDispatch,
    logger?: Logger
): () => ScaffoldingResult {
    const bids: BThreadBids[] = [];
    const enabledIds = new Set<string>();
    const destroyOnDisableThreadIds = new Set<string>();
    let bThreadStateById: Record<string, BThreadState>;
    function enableBThread({id, title, gen, props, key, destroyOnDisable}: FlowContext): BThreadState {
        id = createBThreadId(id, key);
        enabledIds.add(id);
        if (bThreadDictionary[id]) {
            bThreadDictionary[id].resetOnPropsChange(props);
        } else {
            logger?.addThreadInfo(id, title, props);
            if(destroyOnDisable) destroyOnDisableThreadIds.add(id);
            bThreadDictionary[id] = new BThread(id, gen, props, dispatch, key, logger, title);
        }
        const threadBids = bThreadDictionary[id].getBids();
        if(threadBids) bids.push(threadBids);
        bThreadStateById[id] = bThreadDictionary[id].state;
        return bThreadDictionary[id].state;
    }
    function getCached<T>(event: FCEvent | string): CachedItem<T> {
        event = toEvent(event);
        return eventCache.get(event)!;
    }
    function run() {
        bThreadStateById = {};
        enabledIds.clear();
        bids.length = 0;
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
            bThreadStateById: bThreadStateById
        };
    }
    return run;
}

// -----------------------------------------------------------------------------------
// UPDATE LOOP

export interface ScenariosContext {
    dispatch: EventDispatch;
    event: GetCachedItem;
    pending: EventMap<PendingEventInfo>;
    blocks: EventMap<Bid[]>;
    state: Record<string, BThreadState>;
    log?: Log;
}
export type UpdateLoopFunction = () => ScenariosContext;
export type ReplayMap = Map<number, Action>;

export function createUpdateLoop(stagingFunction: StagingFunction, actionDispatch: ActionDispatch, disableLogging?: boolean): [UpdateLoopFunction, EventDispatch, Action[], ReplayMap, ActionDispatch] {
    const bThreadDictionary: BThreadDictionary = {};
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
        const { bThreadBids, bThreadStateById } = scaffold();
        const bids = getAllBids(bThreadBids);
        // get next action
        let action: Action | undefined;
        if(replayMap.size !== 0) {
            action = replayMap.get(actionIndex);
            replayMap.delete(actionIndex);
            if(action?.type === ActionType.requested && action.payload === undefined) {
                action.payload = bThreadDictionary[action.threadId].getBids()?.request?.get(action.event)?.payload;
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
            advanceBThreads(bThreadDictionary, eventCache, bids, action);
            return updateLoop();
        }
        // return to UI
        updateEventDispatcher(bids[BidType.wait]);
        return { 
            dispatch: eventDispatch,
            event: getEventCache,
            blocks: bids[BidType.block] || new EventMap(),
            pending: getAllPendingEvents(bThreadDictionary),
            state: bThreadStateById,
            log: logger?.getLog()
        }
    }
    return [updateLoop, eventDispatch, actionQueue, replayMap, actionDispatch];
}