import { GeneratorFn, BThread, InterceptResultType } from './bthread';
import { getAllBids, BidType, AllBidsByType, getMatchingBids } from './bid';
import { Logger, Log } from './logger';
import { Action, getNextActionFromRequests, ActionType } from './action';
import { setupEventDispatcher, EventDispatch } from "./event-dispatcher";
import { EventMap, FCEvent, toEvent } from './event';
import * as utils from './utils';

type DangerouslySetCache = (payload: any) => void

export interface CachedItem<T> {
    current: T;
    set?: DangerouslySetCache;
}

type EnableThreadFunctionType = (gen: GeneratorFn, args?: any[], key?: string | number) => void;
type EnableEventCache = (event: FCEvent | string, initial?: any) => CachedItem<any> | undefined;
export type StagingFunction = (e: EnableThreadFunctionType, s: EnableEventCache) => void;
export type ActionDispatch = (action: Action) => void;
export type TriggerWaitDispatch = (payload: any) => void;
export type UpdateLoopFunction = (actionQueue?: Action[]) => ScenariosContext;
type EventCache = EventMap<CachedItem<any>>;
type GetCache = (eventName: string, key?: string | number) => any;
type GetIsPending =(eventName: string, eventKey?: string | number) => boolean;

export interface BThreadDictionary {
    [Key: string]: BThread;
}

export interface ScenariosContext {
    dispatch: EventDispatch;
    latest: GetCache;
    isPending: GetIsPending;
    log?: Log;
}

function createScenarioId(generator: GeneratorFn, key?: string | number): string {
    const id = generator.name;
    return key || key === 0 ? `${id}_${key.toString()}` : id;
}

function interceptAction(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, action: Action): Action | undefined {
    let bids = getMatchingBids(allBids[BidType.intercept], action.event);
    if(bids === undefined || bids.length === 0) return action;
    bids = [...bids];
    while(bids.length > 0) {
        const nextBid = bids.pop();
        if(nextBid === undefined) continue;
        const nextAction = {...action};
        if(nextBid.payload !== undefined && (nextAction.type === ActionType.dispatched || nextAction.type === ActionType.requested)) {
            nextAction.payload = (typeof nextBid.payload === 'function') ? nextBid.payload(nextAction.payload) : nextBid.payload;
            if(utils.isThenable(nextAction.payload) && bThreadDictionary[nextAction.threadId]) {
                bThreadDictionary[nextAction.threadId].addPendingRequest(nextBid.event, nextAction.payload);
                return undefined;
            }
        }
        const interceptResult = bThreadDictionary[nextBid.threadId].progressIntercept(nextAction, nextBid);
        if(interceptResult === InterceptResultType.interceptingThread) return undefined;
        if(interceptResult === InterceptResultType.progress) action = nextAction;
    } 
    return action;
}

function advanceRequests(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, action: Action): void {
    const bids = getMatchingBids(allBids[BidType.request], action.event);
    if(bids === undefined || bids.length === 0) return;
    bids.forEach(bid => {
        bThreadDictionary[bid.threadId].progressRequest(action, bid);
    });
}

function advanceWaits(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, action: Action): boolean {
    const bids = getMatchingBids(allBids[BidType.wait], action.event);
    if(bids === undefined || bids.length === 0) return false;
    bids.forEach(bid => {
        bThreadDictionary[bid.threadId].progressWait(action, bid);
    });
    return true;
}

function advanceBThreads(bThreadDictionary: BThreadDictionary, eventCache: EventCache, allBids: AllBidsByType, action: Action): Action | undefined {
    if(action.type === ActionType.initial) return undefined;
    // requested
    if(action.type === ActionType.requested) {
        if (typeof action.payload === "function") {
            action.payload = action.payload(eventCache.get(action.event)?.current);
        } else if(action.payload === undefined) {
            action.payload = eventCache.get(action.event)?.current;
        }
        if(utils.isThenable(action.payload) && bThreadDictionary[action.threadId]) {
            bThreadDictionary[action.threadId].addPendingRequest(action.event, action.payload);
            return undefined;
        }
        const nextAction = interceptAction(allBids, bThreadDictionary, action);
        if(!nextAction) return undefined
        advanceRequests(allBids, bThreadDictionary, nextAction);
        advanceWaits(allBids, bThreadDictionary, nextAction);
        return nextAction;
    }
    // dispatched
    if(action.type === ActionType.dispatched) {
        const nextAction = interceptAction(allBids, bThreadDictionary, action);
        if(!nextAction) return undefined
        const isValidDispatch = advanceWaits(allBids, bThreadDictionary, nextAction);
        if(!isValidDispatch) console.warn('action was not waited for: ', action.event.name)
        return nextAction;
    }
    // resolved
    if(action.type === ActionType.resolved) {
        if(bThreadDictionary[action.threadId]) {
            const isResolved = bThreadDictionary[action.threadId].resolvePending(action);
            if(isResolved === false) return undefined;
        }
        const nextAction = interceptAction(allBids, bThreadDictionary, action);
        if(!nextAction) return undefined;
        bThreadDictionary[action.threadId].progressRequest(nextAction); // request got resolved
        advanceRequests(allBids, bThreadDictionary, nextAction);
        advanceWaits(allBids, bThreadDictionary, nextAction); 
        return nextAction;
    }
    // rejected
    if(action.type === ActionType.rejected) {
        if(bThreadDictionary[action.threadId]) {
            bThreadDictionary[action.threadId].rejectPending(action);
        }
        return undefined;
    }
}

function updateEventCache(eventCache: EventCache, event: FCEvent | undefined, payload: any): void {
    if (!event || payload === undefined) return;
    const events = eventCache.getAllMatchingEvents(event);
    if(!events) return;
    events.forEach(event => {
        const val = eventCache.get(event) || {current: undefined};
        val.current = payload;
        eventCache.set(event, val);      
    }); 
}

function setupScaffolding(
    stagingFunction: StagingFunction,
    bThreadDictionary: BThreadDictionary,
    eventCache: EventCache,
    dispatch: ActionDispatch,
    logger?: Logger
) {
    const orderedIds: string[] = [];
    const enableBThread: EnableThreadFunctionType = (gen: GeneratorFn, args: any[] = [], key?: string | number): void => {
        const id: string = createScenarioId(gen, key);
        orderedIds.push(id);
        if (bThreadDictionary[id]) {
            bThreadDictionary[id].resetOnArgsChange(args);
        } else {
            bThreadDictionary[id] = new BThread(id, gen, args, dispatch, key, logger);
        }
    };
    const setCache = (event: FCEvent | string) => (payload: any) => updateEventCache(eventCache, toEvent(event), payload);
    const enableEventCache: EnableEventCache = (event: FCEvent | string, initial?: any): CachedItem<any> | undefined => {
        event = toEvent(event);
        if(!eventCache.has(event)) {
            eventCache.set(event, {current: initial});
        }
        const cache = eventCache.get(event);
        if(cache !== undefined) {
            cache.set = setCache(event);
        }
        return cache;
    }
    return (): string[] => {
        orderedIds.length = 0;
        stagingFunction(enableBThread, enableEventCache); 
        return [...orderedIds];
    }
}

// -----------------------------------------------------------------------------------
// UPDATE LOOP

export function createUpdateLoop(stagingFunction: StagingFunction, dispatch: ActionDispatch, disableLogging?: boolean): [UpdateLoopFunction, EventDispatch] {
    const bThreadDictionary: BThreadDictionary = {};
    const eventCache: EventCache = new EventMap();
    const logger = disableLogging ? undefined : new Logger();
    const scaffold = setupScaffolding(stagingFunction, bThreadDictionary, eventCache, dispatch, logger);
    const [updateEventDispatcher, eventDispatch] = setupEventDispatcher(dispatch);
    const getEventCache: GetCache = (eventName: string, key?: string | number) => eventCache.get({name: eventName, key: key})?.current;
    // main loop-function:
    const updateLoop: UpdateLoopFunction = (actionQueue?: Action[]): ScenariosContext => {
        let action = actionQueue?.shift();
        // start a replay?
        if (action && action.type === ActionType.replay) {
            Object.keys(bThreadDictionary).forEach((threadId): void => { 
                bThreadDictionary[threadId].onDelete();
                delete bThreadDictionary[threadId]
            }); // delete all BThreads
            eventCache.clear();
            logger?.resetLog(); // empty current log
            return updateLoop(action.payload); // start a replay
        }
        // not a replay
        const orderedThreadIds = scaffold();
        const bThreadBids = orderedThreadIds.map(id => bThreadDictionary[id].getBids());
        const bids = getAllBids(bThreadBids);
        action = action || getNextActionFromRequests(bids.request);
        if (action) {
            logger?.logAction(action);
            const a = advanceBThreads(bThreadDictionary, eventCache, bids, action);
            updateEventCache(eventCache, a?.event, a?.payload);
            return updateLoop(actionQueue);
        }
        // ------ create the return value:
        updateEventDispatcher(bids.wait?.difference(bids[BidType.pending]));
        const pendingEventMap = bids[BidType.pending] || new EventMap();
        logger?.logPendingEvents(bids[BidType.pending] || new EventMap());
        logger?.logWaits(bids.wait);
        return {
            dispatch: eventDispatch,
            latest: getEventCache, // latest values from event cache
            isPending: (eventName: string, eventKey?: string | number) => pendingEventMap.has({name: eventName, key: eventKey}),
            log: logger?.getLog() // get all actions and reactions + pending event-names by thread-Id
        };
    };
    return [updateLoop, eventDispatch];
}
