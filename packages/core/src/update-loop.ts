import { BThread, ExtendResultType, BThreadState, BThreadKey } from './bthread';
import { getAllBids, BidType, AllBidsByType, getMatchingBids, BThreadBids, BidSubType, PendingEventInfo, Bid } from './bid';
import { Logger, Log } from './logger';
import { Action, getNextActionFromRequests, ActionType } from './action';
import { setupEventDispatcher, EventDispatch } from "./event-dispatcher";
import { EventMap, FCEvent, toEvent } from './event';
import * as utils from './utils';
import { EventCache, CachedItem } from './event-cache'
import { FlowContext } from './flow';


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


function extendAction(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, action: Action): Action | undefined {
    const bids = getMatchingBids(allBids[BidType.extend], action.event);
    if(bids === undefined || bids.length === 0) return action;
    while(bids.length > 0) {
        const nextBid = bids.pop();
        if(nextBid === undefined) continue;
        if(nextBid.payload !== undefined && (action.type === ActionType.dispatched || action.type === ActionType.requested)) {
            action.payload = (typeof nextBid.payload === 'function') ? nextBid.payload(action.payload) : nextBid.payload;
            if(utils.isThenable(action.payload) && bThreadDictionary[action.threadId]) {
                bThreadDictionary[action.threadId].addPendingRequest(nextBid.event, action.payload);
                return undefined;
            }
        }
        const extendResult = bThreadDictionary[nextBid.threadId].progressExtend(action, nextBid);
        if(extendResult === ExtendResultType.extendingThread) return undefined;
    } 
    return action;
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


function advanceBThreads(bThreadDictionary: BThreadDictionary, eventCache: EventCache, allBids: AllBidsByType, action: Action): void {
    switch (action.type) {
        case ActionType.requested: {
            const nextAction = extendAction(allBids, bThreadDictionary, action);
            if(!nextAction) return; // was extended
            bThreadDictionary[nextAction.threadId].progressRequest(eventCache, nextAction); // request got resolved
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
        case ActionType.promise: {
            bThreadDictionary[action.threadId].addPendingRequest(action.event, action.payload);
            advanceOnPending(allBids, bThreadDictionary, action);
            break;
        }
        case ActionType.resolved: {
            if(bThreadDictionary[action.threadId]) {
                const isResolved = bThreadDictionary[action.threadId].resolvePending(action);
                if(isResolved === false) return;
            }
            const nextAction = extendAction(allBids, bThreadDictionary, action);
            if(!nextAction) return; // was extended
            bThreadDictionary[action.threadId].progressRequest(eventCache, nextAction); // request got resolved
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
    actionDispatch: ActionDispatch;
    event: GetCachedItem;
    pending: EventMap<PendingEventInfo>;
    blocks: EventMap<Bid[]>;
    bThreadState: Record<string, BThreadState>;
    log?: Log;
}
export type UpdateLoopFunction = (actionQueue?: Action[] | undefined) => ScenariosContext;


export function createUpdateLoop(stagingFunction: StagingFunction, dispatch: ActionDispatch, disableLogging?: boolean): [UpdateLoopFunction, EventDispatch] {
    const bThreadDictionary: BThreadDictionary = {};
    const eventCache: EventCache = new EventMap();
    const logger = disableLogging ? undefined : new Logger();
    let scaffold = setupScaffolding(stagingFunction, bThreadDictionary, eventCache, dispatch, logger);
    const [updateEventDispatcher, eventDispatch] = setupEventDispatcher(dispatch);
    const getEventCache: GetCachedItem = (event: FCEvent | string) => eventCache.get(toEvent(event));
    const context: ScenariosContext = {
        dispatch: eventDispatch,
        actionDispatch: dispatch,
        event: getEventCache,
        blocks: new EventMap(),
        pending: new EventMap(),
        bThreadState: {},
        log: undefined
    }
    let isReplay = false;
    // main loop-function:
    function updateLoop(actionQueue?: Action[]): ScenariosContext {
        let action = actionQueue?.shift();
        // start a replay?
        if (!isReplay && action?.isReplay) {
            // delete all BThreads
            isReplay = true;
            Object.keys(bThreadDictionary).forEach((threadId): void => { 
                bThreadDictionary[threadId].destroy();
                delete bThreadDictionary[threadId];
            });
            eventCache.clear(); // clear cache
            scaffold = setupScaffolding(stagingFunction, bThreadDictionary, eventCache, dispatch, logger); // renew scaffolding function, because of the onDestroy-ids.
        } else if (isReplay && action?.isReplay === false) {
            isReplay = false;
        }
        // not a replay
        const {bThreadBids, bThreadStateById} = scaffold();
        const bids = getAllBids(bThreadBids);
        action = action || getNextActionFromRequests(eventCache, bids.request, bids.wait);
        if (action) {
            logger?.logAction(action);
            advanceBThreads(bThreadDictionary, eventCache, bids, action);
            return updateLoop(actionQueue);
        }
        // create the context:
        updateEventDispatcher(bids[BidType.wait], bids[BidType.pending]);
        context.blocks = bids[BidType.block] || new EventMap();
        context.pending = bids[BidType.pending];
        context.bThreadState = bThreadStateById;
        context.log = logger?.getLog();
        return context;
    }
    return [updateLoop, eventDispatch];
}