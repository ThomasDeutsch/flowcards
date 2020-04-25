/* eslint-disable @typescript-eslint/no-explicit-any */

import { ThreadGen, BThread, BThreadState, BThreadBids } from './bthread';
import { getAllBids, BidType, AllBidsByType, getMatchingBids, Bid } from './bid';
import { Logger, Log } from './logger';
import { Action, getNextActionFromRequests, ActionType } from './action';
import { setupEventDispatcher, EventDispatch } from "./event-dispatcher";
import { EventMap, FCEvent, toEvent } from './event';
import * as utils from './utils';


type EnableThreadFunctionType = (gen: ThreadGen, args?: any[], key?: string | number) => BThreadState;
type EnableStateFunctionType = (event: FCEvent, initialValue: any) => StateRef<any>;
export type StagingFunction = (e: EnableThreadFunctionType, s: EnableStateFunctionType) => void;
export type ActionDispatch = (action: Action) => void;
export type TriggerWaitDispatch = (payload: unknown) => void;
export type UpdateLoopFunction = (dispatchedAction: Action | null, nextActions?: Action[] | null) => ScenariosContext;
type EventCache = EventMap<StateRef<unknown>>;

export interface BThreadDictionary {
    [Key: string]: BThread;
}

export interface StateRef<T> {
    current: T;
    previous: T;
}

type ReplayDispatch = (actions: Action[]) => void;

export interface ScenariosContext {
    dispatch: EventDispatch;
    dispatchReplay: ReplayDispatch;
    state: Record<string, any>;
    bThreadState: Record<string, BThreadState>;
    log: Log;
}

function createScenarioId(generator: ThreadGen, key?: string | number): string {
    const id = generator.name;
    return key || key === 0 ? `${id}_${key.toString()}` : id;
}

function interceptAction(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, a: Action): boolean {
    let bids = getMatchingBids(allBids[BidType.intercept], a.event);
    if(bids === undefined || bids.length === 0) return false;
    bids = [...bids];
    while(bids.length > 0) {
        const next = bids.pop();
        if(next) {
            const nextAction = {...a};
            nextAction.event.key = next.event.key
            const wasIntercepted = bThreadDictionary[next.threadId].progressIntercept(nextAction);
            // this can be intercepted in threee ways:
            // 1. intercept has a payload/payload functino that returns somehting that is not a promise -> the action will be modified and the next bid is chosen
            // 2. intercept has a payloadfunction that is a promise -> pending-event is created and is resolved when the promise is resolved.
            // 3. intercept has no payload:  the intercept itself is a promise.
            if(wasIntercepted) return true;
        }
    } 
    return false;
}

function advanceRequests(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, a: Action): void {
    const bids = getMatchingBids(allBids[BidType.request], a.event);
    if(bids === undefined || bids.length === 0) return;
    bids.forEach(({threadId, event}): void => {
        const nextAction = {...a};
        nextAction.event.key = event.key
        bThreadDictionary[threadId].progressRequest(nextAction);
    });
}

function advanceWaits(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, a: Action): void {
    const bids = getMatchingBids(allBids[BidType.wait], a.event);
    if(bids === undefined || bids.length === 0) return;
    bids.forEach(({ threadId, event }): void => {
        const nextAction = {...a};
        nextAction.event.key = event.key
        bThreadDictionary[threadId].progressWait(nextAction);
    });
}


function advanceBThreads(bThreadDictionary: BThreadDictionary, allBids: AllBidsByType, action: Action): void {
    if(action.type === ActionType.initial) return;
    if(action.type === ActionType.requested) {
        if (typeof action.payload === "function") {
            action.payload = action.payload();
        }
        if(utils.isThenable(action.payload) && bThreadDictionary[action.threadId]) {
            bThreadDictionary[action.threadId].addPendingRequest(action.event, action.payload);
            return;
        }
        if(interceptAction(allBids, bThreadDictionary, action)) return;
        advanceRequests(allBids, bThreadDictionary, action);
        advanceWaits(allBids, bThreadDictionary, action);
    }
    else if(action.type === ActionType.dispatched) {
        if(interceptAction(allBids, bThreadDictionary, action)) return;
        advanceWaits(allBids, bThreadDictionary, action);
    }
    else if(action.type === ActionType.resolved) {
        if(bThreadDictionary[action.threadId]) {
            bThreadDictionary[action.threadId].resolvePending(action);
        }
        if(interceptAction(allBids, bThreadDictionary, action)) return;
        bThreadDictionary[action.threadId].progressRequest(action); // request got resolved
        advanceRequests(allBids, bThreadDictionary, action);
        advanceWaits(allBids, bThreadDictionary, action);
    }
    else if(action.type === ActionType.rejected) {
        if(bThreadDictionary[action.threadId]) {
            bThreadDictionary[action.threadId].rejectPending(action);
        }
    }
}


function updateEventCache(eventCache: EventCache, action: Action): void {
    if ((action.type === ActionType.requested) && eventCache.has(action.event)) {
        const val = eventCache.get(action.event);
        if(val) {
            val.previous = val.current;
            val.current = action.payload;
            eventCache.set(action.event, val);
        }
    }
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
    const enableBThread: EnableThreadFunctionType = (gen: ThreadGen, args: unknown[] = [], key?: string | number): BThreadState => {
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
    const enableEventCache: EnableStateFunctionType = (event: FCEvent, initialValue: unknown): StateRef<unknown> => {
        if(!eventCache.has(event)) {
            eventCache.set(event, {current: initialValue, previous: null});
        }
        return eventCache.get(event)!;
    }
    stagingFunction(enableBThread, enableEventCache); 
    return orderedThreadIds;
}

// -----------------------------------------------------------------------------------
// UPDATE LOOP

export function createUpdateLoop(stagingFunction: StagingFunction, dispatch: ActionDispatch): UpdateLoopFunction {
    const bThreadDictionary: BThreadDictionary = {};
    const eventCache: EventCache = new EventMap();
    let orderedThreadIds: string[];
    const logger = new Logger();
    const getEventDispatcher = setupEventDispatcher(dispatch);
    const getEventCache = (event: FCEvent | string) => eventCache.get(toEvent(event))?.current;

    const updateLoop: UpdateLoopFunction = (dispatchedAction: Action | null, remainingReplayActions: Action[] | null = null): ScenariosContext => {
        if (dispatchedAction) { 
            if (dispatchedAction.type === ActionType.replay) {
                Object.keys(bThreadDictionary).forEach((threadId): void => { 
                    bThreadDictionary[threadId].onDelete();
                    delete bThreadDictionary[threadId]
                }); // delete all BThreads
                eventCache.clear();
                logger.resetLog(); // empty current log
                return updateLoop(null, dispatchedAction.payload); // start a replay
            }
        } 
        orderedThreadIds = stageBThreadsAndEventCaches(stagingFunction, bThreadDictionary, eventCache, dispatch, logger);
        const bThreadBids = orderedThreadIds.map((id): BThreadBids  => bThreadDictionary[id].getBids());
        const bids = getAllBids(bThreadBids);
        // get the next action
        let nextAction: Action | null = null, restActions: Action[] | null = null;
        if(remainingReplayActions !== null && remainingReplayActions.length > 0) {
            [nextAction, ...restActions] = remainingReplayActions;
        } else if(dispatchedAction) {
            nextAction = dispatchedAction;
        } else {
            nextAction = getNextActionFromRequests(bids.request);
        }
        if (nextAction) {
            logger.logAction(nextAction);
            advanceBThreads(bThreadDictionary, bids, nextAction);
            updateEventCache(eventCache, nextAction);
            return updateLoop(null, restActions);
        }
        // ------ create the return value:
        logger.logPendingEvents(bids.pendingEvents);
        const bThreadStateById = Object.keys(bThreadDictionary).reduce((acc: Record<string, BThreadState>, threadId: string): Record<string, BThreadState> => {
            acc[threadId] = bThreadDictionary[threadId].state;
            return acc;
        }, {});
        return {
            dispatch: getEventDispatcher(bids.wait),
            dispatchReplay: (actions: Action[]): void => dispatch({type: ActionType.replay, payload: actions, threadId: "", event: {name: "replay"}}), // triggers a replay
            state: getEventCache, // event caches
            bThreadState: bThreadStateById, // BThread state by id
            log: logger.getLog() // get all actions and reactions + pending event-names by thread-Id
        };
    };
    return updateLoop;
}