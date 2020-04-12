/* eslint-disable @typescript-eslint/no-explicit-any */

import { ThreadGen, BThread, BThreadState } from './bthread';
import { getAllBids, BidsByType, BidType, AllBidsByType, GuardFunction } from './bid';
import { Logger, Log } from './logger';
import { Action, getNextActionFromRequests, ActionType } from './action';
import { dispatchByWait, DispatchByWait, GuardedDispatch } from "./dispatch-by-wait";
import * as utils from './utils';


type EnableThreadFunctionType = (gen: ThreadGen, args?: any[], key?: string | number) => BThreadState;
type EnableStateFunctionType = (id: string, initialValue: any) => StateRef<any>;
export type StagingFunction = (e: EnableThreadFunctionType, s: EnableStateFunctionType) => void;
export type ActionDispatch = (action: Action) => void;
type eventCacheByEventName = Record<string, StateRef<any>>;
export type UpdateLoopFunction = (dispatchedAction: Action | null, nextActions?: Action[] | null) => ScenariosContext;

export interface BThreadDictionary {
    [Key: string]: BThread;
}

export interface StateRef<T> {
    current: T;
    previous: T;
}

type ReplayDispatch = (actions: Action[]) => void;

export interface ScenariosContext {
    dispatch: Record<string, GuardedDispatch>;
    dispatchReplay: ReplayDispatch;
    state: Record<string, any>;
    bThreadState: Record<string, BThreadState>;
    log: Log;
}

function createScenarioId(generator: ThreadGen, key?: string | number): string {
    const id = generator.name;
    return key || key === 0 ? `${id}_${key.toString()}` : id;
}


function advanceBThreads(bThreadDictionary: BThreadDictionary, bids: AllBidsByType, action: Action): void {
    if(action.type === ActionType.initial) return;

    const interceptEvent = (): boolean => {
        let interceptBids = bids[BidType.intercept][action.eventName];        
        if(!interceptBids || interceptBids.length === 0) return false;
        interceptBids = [...interceptBids];
        while(interceptBids.length > 0) {
            const nextInterceptBid = interceptBids.pop();
            if(nextInterceptBid) {
                const wasIntercepted = bThreadDictionary[nextInterceptBid.threadId].progressIntercept(action);
                if(wasIntercepted) return true;
            }
        } 
        return false;
    }
    const advanceRequests = (): void => {
        if(!bids[BidType.request][action.eventName]) return;
        bids[BidType.request][action.eventName].forEach((bid): void => {
            bThreadDictionary[bid.threadId].progressRequest(action);
        });
    }
    const advanceWaits = (): void => {
        if(!bids[BidType.wait][action.eventName]) return;
        bids[BidType.wait][action.eventName].forEach(({ threadId }): void => {
            bThreadDictionary[threadId].progressWait(action);
        });
    }
    if(action.type === ActionType.requested) {
        if (typeof action.payload === "function") {
            action.payload = action.payload();
        }
        if(utils.isThenable(action.payload) && bThreadDictionary[action.threadId]) {
            bThreadDictionary[action.threadId].addPromise(action.eventName, action.payload);
            return;
        }
        if(interceptEvent()) return;
        advanceRequests();
        advanceWaits();
    }
    else if(action.type === ActionType.dispatched) {
        if(interceptEvent()) return;
        advanceWaits();
    }
    else if(action.type === ActionType.resolved) {
        if(bThreadDictionary[action.threadId]) {
            bThreadDictionary[action.threadId].resolvePending(action);
        }
        if(interceptEvent()) return;
        bThreadDictionary[action.threadId].progressRequest(action); // request got resolved
        advanceRequests();
        advanceWaits();
    }
    else if(action.type === ActionType.rejected) {
        if(bThreadDictionary[action.threadId]) {
            bThreadDictionary[action.threadId].rejectPending(action);
        }
    }
}


function updateEventCache(eventCacheByEventName: eventCacheByEventName, action: Action): void {
    if ((action.type === ActionType.requested) && (action.eventName in eventCacheByEventName)) {
        eventCacheByEventName[action.eventName].previous = eventCacheByEventName[action.eventName].current;
        eventCacheByEventName[action.eventName].current = action.payload;
    }
}


function stageBThreadsAndEventCaches(
    stagingFunction: StagingFunction,
    bThreadDictionary: BThreadDictionary,
    eventCacheByEventName: eventCacheByEventName,
    dispatch: ActionDispatch,
    logger?: Logger
): string[] {
    const threadIds: Set<string> = new Set();
    const eventCacheIds: Set<string> = new Set();
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
    const enableEventCache: EnableStateFunctionType = (id: string, initialValue: any): StateRef<any> => {
        eventCacheIds.add(id);
        if(!eventCacheByEventName[id]) {
            eventCacheByEventName[id] = {current: initialValue, previous: null};
        }
        return eventCacheByEventName[id];
    }
    stagingFunction(enableBThread, enableEventCache); 
    Object.keys(eventCacheByEventName).forEach((id): void => { // delete unused states
        if(!eventCacheIds.has(id)) {
            delete eventCacheByEventName[id];
        }
    });
    return orderedThreadIds;
}

// -----------------------------------------------------------------------------------
// UPDATE LOOP

export function createUpdateLoop(stagingFunction: StagingFunction, dispatch: ActionDispatch): UpdateLoopFunction {
    const bThreadDictionary: BThreadDictionary = {};
    const eventCacheByEventName: eventCacheByEventName  = {};
    let orderedThreadIds: string[];
    const logger = new Logger();
    const dwpObj: DispatchByWait = {};
    const combinedGuardByWait: Record<string, GuardFunction> = {};

    const updateLoop: UpdateLoopFunction = (dispatchedAction: Action | null, remainingReplayActions: Action[] | null = null): ScenariosContext => {
        if (dispatchedAction) { 
            if (dispatchedAction.type === ActionType.replay) {
                Object.keys(bThreadDictionary).forEach((threadId): void => { 
                    bThreadDictionary[threadId].onDelete();
                    delete bThreadDictionary[threadId]
                }); // delete all BThreads
                Object.keys(eventCacheByEventName).forEach((cacheId): void => { delete eventCacheByEventName[cacheId] }); // delete event-cache
                logger.resetLog(); // empty current log
                return updateLoop(null, dispatchedAction.payload); // start a replay
            }
        } 
        orderedThreadIds = stageBThreadsAndEventCaches(stagingFunction, bThreadDictionary, eventCacheByEventName, dispatch, logger);
        const threadBids = orderedThreadIds.map((id): BidsByType | null  => bThreadDictionary[id].getBids());
        const bids = getAllBids(threadBids);
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
            updateEventCache(eventCacheByEventName, nextAction);
            return updateLoop(null, restActions);
        }
        // ------ create the return value:
        const waitsWithoutPending = utils.withoutProperties(Array.from(bids.pendingEvents), bids.wait);
        logger.logWaits(waitsWithoutPending);
        logger.logPendingEvents(bids.pendingEvents);
        const dbw = dispatchByWait(dispatch, dwpObj, combinedGuardByWait, waitsWithoutPending);
        const bThreadStateById = Object.keys(bThreadDictionary).reduce((acc: Record<string, BThreadState>, threadId: string): Record<string, BThreadState> => {
            acc[threadId] = bThreadDictionary[threadId].state;
            return acc;
        }, {});
        const stateById = Object.keys(eventCacheByEventName).reduce((acc: Record<string, StateRef<any>>, stateId: any): Record<string, any> => {
            acc[stateId] = eventCacheByEventName[stateId].current;
            return acc;
        }, {});
        return {
            dispatch: dbw, // dispatch by wait ( ui can only waiting events )
            dispatchReplay: (actions: Action[]) => dispatch({type: ActionType.replay, payload: actions, threadId: "", eventName: ""}), // triggers a replay
            state: stateById, // event caches
            bThreadState: bThreadStateById, // BThread state by id
            log: logger.getLog() // get all actions and reactions + pending event-names by thread-Id
        };
    };
    // Todo: why not fire initial action here ???
    return updateLoop;
}