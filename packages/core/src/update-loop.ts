import { BThread, ExtendResultType, BThreadState, BThreadKey } from './bthread';
import { getAllBids, BidType, AllBidsByType, getMatchingBids, BThreadBids } from './bid';
import { Logger, Log } from './logger';
import { Action, getNextActionFromRequests, ActionType } from './action';
import { setupEventDispatcher, EventDispatch } from "./event-dispatcher";
import { EventMap, FCEvent, toEvent } from './event';
import * as utils from './utils';
import { EventCache, setEventCache, CachedItem } from './event-cache'
import { FlowContext } from './flow';


type EnableThread = ({id, title, gen, props, key}: FlowContext) => BThreadState;
type GetCachedItem = (event: FCEvent | string) => CachedItem<any> | undefined; // todo: replace any with generic type
export type StagingFunction = (enable: EnableThread, cached: GetCachedItem) => void;
export type ActionDispatch = (action: Action) => void;
export type TriggerWaitDispatch = (payload: any) => void;
type GetIsPending =  (event: FCEvent | string) => boolean;
export type UpdateLoopFunction = (actionQueue?: Action[] | undefined) => ScenariosContext;


export interface BThreadDictionary {
    [Key: string]: BThread;
}


export interface ScenariosContext {
    dispatch: EventDispatch;
    event: GetCachedItem;
    isPending: GetIsPending;
    log?: Log;
}


function createBThreadId(id: string, key?: BThreadKey): string {
    return key || key === 0 ? `${id}_${key.toString()}` : id;
}


function extendAction(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, action: Action): Action | undefined {
    let bids = getMatchingBids(allBids[BidType.extend], action.event);
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
        const extendResult = bThreadDictionary[nextBid.threadId].progressExtend(nextAction, nextBid);
        if(extendResult === ExtendResultType.extendingThread) return undefined;
        if(extendResult === ExtendResultType.progress) action = nextAction;
    } 
    return action;
}


function advanceWaits(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, action: Action): boolean {
    const bids = getMatchingBids(allBids[BidType.wait], action.event) || [];
    if(bids.length === 0) return false;
    bids.forEach(bid => {
        bThreadDictionary[bid.threadId].progressWait(action, bid);
    });
    return true;
}


function advanceBThreads(bThreadDictionary: BThreadDictionary, eventCache: EventCache, allBids: AllBidsByType, action: Action): void {
    // requested
    if(action.type === ActionType.requested) {
        const nextAction = extendAction(allBids, bThreadDictionary, action);
        if(!nextAction) return; // was extended
        if(nextAction.cacheEnabled === true) setEventCache(eventCache, nextAction.event, nextAction.payload);
        bThreadDictionary[nextAction.threadId].progressRequest(nextAction); // request got resolved
        advanceWaits(allBids, bThreadDictionary, nextAction);
    }
    // dispatched
    else if(action.type === ActionType.dispatched) {
        const nextAction = extendAction(allBids, bThreadDictionary, action);
        if(!nextAction) return; // was extended
        const isValidDispatch = advanceWaits(allBids, bThreadDictionary, nextAction);
        if(!isValidDispatch) console.warn('action was not waited for: ', action.event.name);
    }
    // resolved
    else if(action.type === ActionType.resolved) {
        if(bThreadDictionary[action.threadId]) {
            const isResolved = bThreadDictionary[action.threadId].resolvePending(action);
            if(isResolved === false) return;
        }
        const nextAction = extendAction(allBids, bThreadDictionary, action);
        if(!nextAction) return; // was extended
        if(nextAction.cacheEnabled === true) setEventCache(eventCache, nextAction.event, nextAction.payload);
        bThreadDictionary[action.threadId].progressRequest(nextAction); // request got resolved
        advanceWaits(allBids, bThreadDictionary, nextAction); 
    }
    // rejected
    else if(action.type === ActionType.rejected) {
        if(bThreadDictionary[action.threadId]) {
            bThreadDictionary[action.threadId].rejectPending(action);
        }
    }
}


function setupScaffolding(
    stagingFunction: StagingFunction,
    bThreadDictionary: BThreadDictionary,
    eventCache: EventCache,
    dispatch: ActionDispatch,
    logger?: Logger
) {
    const bids: BThreadBids[] = [];
    function enableBThread({id, title, gen, props, key}: FlowContext): BThreadState {
        id = createBThreadId(id, key);
        if (bThreadDictionary[id]) {
            bThreadDictionary[id].resetOnPropsChange(props);
        } else {
            logger?.addThreadInfo(id, title);
            bThreadDictionary[id] = new BThread(id, gen, props, dispatch, key, logger, title);
        }
        const threadBids = bThreadDictionary[id].getBids();
        bids.push(threadBids);
        return bThreadDictionary[id].state;
    }
    function getCached<T>(event: FCEvent | string): CachedItem<T> {
        event = toEvent(event);
        return eventCache.get(event)!;
    }
    function run(): BThreadBids[] {
        bids.length = 0;
        stagingFunction(enableBThread, getCached); 
        return [...bids];
    }
    return run;
}

// -----------------------------------------------------------------------------------
// UPDATE LOOP

export function createUpdateLoop(stagingFunction: StagingFunction, dispatch: ActionDispatch, disableLogging?: boolean): [UpdateLoopFunction, EventDispatch] {
    const bThreadDictionary: BThreadDictionary = {};
    const eventCache: EventCache = new EventMap();
    const logger = disableLogging ? undefined : new Logger();
    const scaffold = setupScaffolding(stagingFunction, bThreadDictionary, eventCache, dispatch, logger);
    const [updateEventDispatcher, eventDispatch] = setupEventDispatcher(dispatch);
    const getEventCache: GetCachedItem = (event: FCEvent | string) => eventCache.get(toEvent(event));
    // main loop-function:
    function updateLoop(actionQueue?: Action[]): ScenariosContext {
        let action = actionQueue?.shift();
        // start a replay?
        if (action && action.type === ActionType.replay) {
            // delete all BThreads
            Object.keys(bThreadDictionary).forEach((threadId): void => { 
                bThreadDictionary[threadId].onDelete();
                delete bThreadDictionary[threadId]
            }); 
            eventCache.clear(); // clear cache
            logger?.resetLog(); // empty current log
            return updateLoop(action.payload); // start a replay
        }
        // not a replay
        const bids = getAllBids(scaffold());
        action = action || getNextActionFromRequests(bThreadDictionary, eventCache, bids.request, bids.wait);
        if (action) {
            logger?.logAction(action);
            advanceBThreads(bThreadDictionary, eventCache, bids, action);
            return updateLoop(actionQueue);
        }
        // create the return value:
        updateEventDispatcher(bids.wait?.difference(bids[BidType.pending]));
        const pendingEventMap = bids[BidType.pending] || new EventMap();
        return {
            dispatch: eventDispatch,
            event: getEventCache, // latest values from event cache
            isPending: (event: FCEvent | string) => pendingEventMap.has(toEvent(event)), // pending Events
            log: logger?.getLog() // get all actions and reactions + pending event-names by thread-Id
        };
    }
    return [updateLoop, eventDispatch];
}