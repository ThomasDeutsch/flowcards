import { GeneratorFn, BThread, BThreadState, InterceptResultType } from './bthread';
import { getAllBids, BidType, AllBidsByType, getMatchingBids } from './bid';
import { Logger, Log } from './logger';
import { Action, getNextActionFromRequests, ActionType } from './action';
import { setupEventDispatcher, EventDispatch } from "./event-dispatcher";
import { EventMap, FCEvent, toEvent } from './event';
import * as utils from './utils';


type EnableThreadFunctionType = (gen: GeneratorFn, args?: any[], key?: string | number) => BThreadState;
type GetEventCache = (event: FCEvent | string, initial?: any) => Ref<any> | undefined;
export type StagingFunction = (e: EnableThreadFunctionType, s: GetEventCache) => void;
export type ActionDispatch = (action: Action) => void;
export type TriggerWaitDispatch = (payload: any) => void;
export type UpdateLoopFunction = (actionQueue?: Action[]) => ScenariosContext;
type EventCache = EventMap<Ref<any>>;
type GetCache = (eventName: string, key?: string | number) => any;
type GetIsPending =(eventName: string, eventKey?: string | number) => boolean;

export interface BThreadDictionary {
    [Key: string]: BThread;
}

export interface Ref<T> {
    current: T;
}

export interface ScenariosContext {
    dispatch: EventDispatch;
    latest: GetCache;
    isPending: GetIsPending;
    bTState: Record<string, BThreadState>;
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
            bThreadDictionary[action.threadId].resolvePending(action);
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

function updateEventCache(eventCache: EventCache, action?: Action): void {
    if (!action || action.payload === undefined) return;
    const events = eventCache.getAllMatchingEvents(action.event);
    if(!events) return;
    events.forEach(event => {
        const val = eventCache.get(event) || {current: undefined};
        val.current = action.payload;
        eventCache.set(event, val);      
    }); 
}

function stageBThreadsAndEventCaches(
    stagingFunction: StagingFunction,
    bThreadDictionary: BThreadDictionary,
    eventCache: EventCache,
    dispatch: ActionDispatch,
    logger?: Logger
): string[] {
    const threadIds: Set<string> = new Set();
    const orderedThreadIds: string[] = [];
    const enableBThread: EnableThreadFunctionType = (gen: GeneratorFn, args: any[] = [], key?: string | number): BThreadState => {
        const id: string = createScenarioId(gen, key);
        threadIds.add(id);
        orderedThreadIds.push(id);
        if (bThreadDictionary[id]) {
            bThreadDictionary[id].resetOnArgsChange(args);
        } else {
            bThreadDictionary[id] = new BThread(id, gen, args, dispatch, key, logger);
        }
        return bThreadDictionary[id].state;
    };
    const getEventCache: GetEventCache = (event: FCEvent | string, initial?: any): Ref<any> | undefined => {
        event = toEvent(event);
        if(!eventCache.has(event)) {
            eventCache.set(event, {current: initial});
        }
        return eventCache.get(event);
    }
    stagingFunction(enableBThread, getEventCache); 
    return orderedThreadIds;
}

// -----------------------------------------------------------------------------------
// UPDATE LOOP

export function createUpdateLoop(stagingFunction: StagingFunction, dispatch: ActionDispatch, disableLogging?: boolean): [UpdateLoopFunction, EventDispatch] {
    const bThreadDictionary: BThreadDictionary = {};
    let orderedThreadIds: string[];
    const logger = disableLogging ? undefined : new Logger();
    const [updateEventDispatcher, eventDispatch] = setupEventDispatcher(dispatch);
    const eventCache: EventCache = new EventMap();
    const getEventCache: GetCache = (eventName: string, key?: string | number) => eventCache.get({name: eventName, key: key})?.current;
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
        orderedThreadIds = stageBThreadsAndEventCaches(stagingFunction, bThreadDictionary, eventCache, dispatch, logger);
        const bThreadBids = orderedThreadIds.map(id => bThreadDictionary[id].getBids());
        const bids = getAllBids(bThreadBids);
        action = action || getNextActionFromRequests(bids.request);
        if (action) {
            logger?.logAction(action);
            const a = advanceBThreads(bThreadDictionary, eventCache, bids, action);
            updateEventCache(eventCache, a);
            return updateLoop(actionQueue);
        }
        // ------ create the return value:
        updateEventDispatcher(bids.wait?.difference(bids[BidType.pending]));
        const pendingEventMap = bids[BidType.pending] || new EventMap();
        logger?.logPendingEvents(bids[BidType.pending] || new EventMap());
        logger?.logWaits(bids.wait);
        const bTStateById = Object.keys(bThreadDictionary).reduce((acc: Record<string, BThreadState>, threadId: string): Record<string, BThreadState> => {
            acc[threadId] = bThreadDictionary[threadId].state;
            return acc;
        }, {});
        return {
            dispatch: eventDispatch, // 
            latest: getEventCache, // latest values from event cache
            isPending: (eventName: string, eventKey?: string | number) => pendingEventMap.has({name: eventName, key: eventKey}),
            bTState: bTStateById, // BThread state by id
            log: logger?.getLog() // get all actions and reactions + pending event-names by thread-Id
        };
    };
    return [updateLoop, eventDispatch];
}
