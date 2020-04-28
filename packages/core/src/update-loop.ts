/* eslint-disable @typescript-eslint/no-explicit-any */

import { ThreadGen, BThread, BThreadState, BThreadBids, InterceptResultType } from './bthread';
import { getAllBids, BidType, AllBidsByType, getMatchingBids } from './bid';
import { Logger, Log } from './logger';
import { Action, getNextActionFromRequests, ActionType } from './action';
import { setupEventDispatcher, EventDispatch } from "./event-dispatcher";
import { EventMap, FCEvent, toEvent } from './event';
import * as utils from './utils';


type EnableThreadFunctionType = (gen: ThreadGen, args?: any[], key?: string | number) => BThreadState;
type EnableStateFunctionType = (event: FCEvent | string, initialValue: any) => StateRef<any>;
export type StagingFunction = (e: EnableThreadFunctionType, s: EnableStateFunctionType) => void;
export type ActionDispatch = (action: Action) => void;
export type TriggerWaitDispatch = (payload: any) => void;
export type UpdateLoopFunction = (dispatchedAction?: Action, nextActions?: Action[]) => ScenariosContext;
type EventCache = EventMap<StateRef<any>>;
type GetStateFunction = (event: FCEvent | string) => any;

export interface BThreadDictionary {
    [Key: string]: BThread;
}

export interface StateRef<T> {
    current: T;
    previous?: T;
}

type ReplayDispatch = (actions: Action[]) => void;

export interface ScenariosContext {
    dispatch: EventDispatch;
    dispatchReplay: ReplayDispatch;
    state: GetStateFunction;
    bThreadState: Record<string, BThreadState>;
    log: Log;
}

function createScenarioId(generator: ThreadGen, key?: string | number): string {
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
        nextAction.event.key = nextBid.event.key;
        if(nextBid.payload !== undefined && (nextAction.type === ActionType.dispatched || nextAction.type === ActionType.requested)) {
            nextAction.payload = (typeof nextBid.payload === 'function') ? nextBid.payload(nextAction.payload) : nextBid.payload;
            if(utils.isThenable(nextAction.payload) && bThreadDictionary[nextAction.threadId]) {
                bThreadDictionary[nextAction.threadId].addPendingRequest(nextAction.event, nextAction.payload);
                return undefined;
            }
        }
        const interceptResult = bThreadDictionary[nextBid.threadId].progressIntercept(nextAction);
        if(interceptResult === InterceptResultType.interceptingThread) return undefined;
        if(interceptResult === InterceptResultType.progress) action = nextAction;
    } 
    return action;
}

function advanceRequests(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, action: Action): void {
    const bids = getMatchingBids(allBids[BidType.request], action.event);
    if(bids === undefined || bids.length === 0) return;
    bids.forEach(({threadId, event}): void => {
        const nextAction = {...action};
        nextAction.event.key = event.key
        bThreadDictionary[threadId].progressRequest(nextAction);
    });
}

function advanceWaits(allBids: AllBidsByType, bThreadDictionary: BThreadDictionary, action: Action): void {
    const bids = getMatchingBids(allBids[BidType.wait], action.event);
    if(bids === undefined || bids.length === 0) return;
    bids.forEach(({ threadId, event }): void => {
        const nextAction = {...action};
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
        const nextAction = interceptAction(allBids, bThreadDictionary, action);
        if(nextAction) {
            advanceRequests(allBids, bThreadDictionary, nextAction);
            advanceWaits(allBids, bThreadDictionary, nextAction);
        }
    }
    else if(action.type === ActionType.dispatched) {
        const nextAction = interceptAction(allBids, bThreadDictionary, action);
        if(nextAction) {
            advanceWaits(allBids, bThreadDictionary, nextAction);
        }
    }
    else if(action.type === ActionType.resolved) {
        if(bThreadDictionary[action.threadId]) {
            bThreadDictionary[action.threadId].resolvePending(action);
        }
        const nextAction = interceptAction(allBids, bThreadDictionary, action);
        if(nextAction) {
            bThreadDictionary[action.threadId].progressRequest(nextAction); // request got resolved
            advanceRequests(allBids, bThreadDictionary, nextAction);
            advanceWaits(allBids, bThreadDictionary, nextAction);
        }
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
    const enableBThread: EnableThreadFunctionType = (gen: ThreadGen, args: any[] = [], key?: string | number): BThreadState => {
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
    const enableEventCache: EnableStateFunctionType = (event: FCEvent | string, initialValue: any): StateRef<any> => {
        event = toEvent(event);
        if(!eventCache.has(event)) {
            eventCache.set(event, {current: initialValue});
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
    const getEventCache: GetStateFunction = (event: FCEvent | string) => eventCache.get(toEvent(event))?.current;

    const updateLoop: UpdateLoopFunction = (dispatchedAction?: Action, remainingReplayActions?: Action[]): ScenariosContext => {
        if (dispatchedAction) { 
            if (dispatchedAction.type === ActionType.replay) {
                Object.keys(bThreadDictionary).forEach((threadId): void => { 
                    bThreadDictionary[threadId].onDelete();
                    delete bThreadDictionary[threadId]
                }); // delete all BThreads
                eventCache.clear();
                logger.resetLog(); // empty current log
                return updateLoop(undefined, dispatchedAction.payload); // start a replay
            }
        } 
        orderedThreadIds = stageBThreadsAndEventCaches(stagingFunction, bThreadDictionary, eventCache, dispatch, logger);
        const bThreadBids = orderedThreadIds.map((id): BThreadBids  => bThreadDictionary[id].getBids());
        const bids = getAllBids(bThreadBids);
        // get the next action
        let nextAction: Action | undefined, restActions: Action[] | undefined;
        if(remainingReplayActions !== undefined && remainingReplayActions.length > 0) {
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
            return updateLoop(undefined, restActions);
        }
        // ------ create the return value:
        logger.logPendingEvents(bids.pendingEvents);
        const bThreadStateById = Object.keys(bThreadDictionary).reduce((acc: Record<string, BThreadState>, threadId: string): Record<string, BThreadState> => {
            acc[threadId] = bThreadDictionary[threadId].state;
            return acc;
        }, {});
        return {
            dispatch: getEventDispatcher(bids.wait?.difference(bids.pendingEvents)),
            dispatchReplay: (actions: Action[]): void => dispatch({type: ActionType.replay, payload: actions, threadId: "", event: {name: "replay"}}), // triggers a replay
            state: getEventCache, // event caches
            bThreadState: bThreadStateById, // BThread state by id
            log: logger.getLog() // get all actions and reactions + pending event-names by thread-Id
        };
    };
    return updateLoop;
}