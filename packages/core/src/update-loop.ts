/* eslint-disable @typescript-eslint/no-explicit-any */

import { ThreadGen, BThread, BThreadDictionary, BThreadState } from './bthread';
import { getAllBids, BidDictionariesByType, BidType, BidDictionaries, GuardFunction } from './bid';
import { Logger, Log } from './logger';
import { Action, getNextActionFromRequests, ActionType } from './action';
import { dispatchByWait, DispatchByWait, GuardedDispatch } from "./dispatch-by-wait";
import * as utils from './utils';


type EnableThreadFunctionType = (gen: ThreadGen, args?: any[], key?: string | number) => BThreadState;
type EnableStateFunctionType = (id: string, initialValue: any) => StateRef<any>;
export type StagingFunction = (e: EnableThreadFunctionType, s: EnableStateFunctionType) => void;
export type DispatchFunction = (action: Action) => void;
type EventCacheDictionary = Record<string, StateRef<any>>;
type ReplayDispatchFunction = (actions: Action[]) => void;
export type UpdateLoopFunction = (dAction: DispatchedAction | null, nextActions?: Action[] | null) => ScenariosContext;


export interface StateRef<T> {
    current: T;
    previous: T;
}

export interface ScenariosContext {
    dispatch: Record<string, GuardedDispatch>;
    replay: ReplayDispatchFunction;
    state: Record<string, any>;
    bThreadState: Record<string, BThreadState>;
    log: Log;
}

export interface DispatchedAction {
    replay?: Action[];
    payload?: Action;
}

function createScenarioId(generator: ThreadGen, key?: string | number): string {
    const id = generator.name;
    return key || key === 0 ? `${id}_${key.toString()}` : id;
}


function advanceBThreads(bThreadDictionary: BThreadDictionary, bids: BidDictionariesByType, action: Action): void {
    if(action.type === ActionType.initial) return;

    // an intercept can be guarded, so we need this.
    const interceptEvent = (): boolean => {
        let interceptBids = bids.intercept[action.eventName];        
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
        if(!bids.request[action.eventName]) return;
        bids.request[action.eventName].forEach((bid): void => {
            bThreadDictionary[bid.threadId].progressRequest(action);
        });
    }
    const advanceWaits = (): void => {
        if(!bids.wait[action.eventName]) return;
        bids.wait[action.eventName].forEach(({ threadId }): void => {
            bThreadDictionary[threadId].progressWait(action);
        });
    }

    if(action.type === ActionType.requested && action.threadId) {
        if(utils.isThenable(action.payload)) {
            bThreadDictionary[action.threadId].addPromise(action.eventName, action.payload);
            return;
        }
        if(interceptEvent()) return
        advanceRequests();
        advanceWaits();
    }
    else if(action.type == ActionType.dispatched) {
        if(interceptEvent()) return
        advanceWaits();
    }
    
    // resolve and reject can only be called from BThreads that have a pending event!!

    else if(action.type == ActionType.resolved) {
        // BEI RESOLVED SOLLTEN AUCH WAIT-REQUEST-BIDS DABEI SEIN, DIE GERADE PENDING SIND.
        if(interceptEvent()) return
        advanceRequests();
        advanceWaits();
    }
    // TODO: REJECTED!
    // Rejected Action:
        // Fehlerbehandlung für den Thread, der den Async Prozess angestoßen hat.
        // bThreadDictionary[bid.threadId].rejectPromise(action.eventName, action.payload, action.threadId === bid.threadId);
        // Lösche pending-events für alle requests und waits -> beende diese Funktion
}


function updateEventCache(eventCacheDictionary: EventCacheDictionary, action: Action): void {
    if ((action.type === ActionType.requested) && (action.eventName in eventCacheDictionary)) {
        eventCacheDictionary[action.eventName].previous = eventCacheDictionary[action.eventName].current;
        eventCacheDictionary[action.eventName].current = action.payload;
    }
}


function stageBThreadsAndEventCaches(
    stagingFunction: StagingFunction,
    bThreadDictionary: BThreadDictionary,
    eventCacheDictionary: EventCacheDictionary,
    dispatch: DispatchFunction,
    logger?: Logger
): string[] {
    const threadIds: Set<string> = new Set();
    const stateIds: Set<string> = new Set();
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
        stateIds.add(id);
        if(!eventCacheDictionary[id]) {
            eventCacheDictionary[id] = {current: initialValue, previous: null};
        }
        return eventCacheDictionary[id];
    }
    stagingFunction(enableBThread, enableEventCache); 
    return orderedThreadIds;
}


// -----------------------------------------------------------------------------------
// UPDATE LOOP

export function createUpdateLoop(stagingFunction: StagingFunction, dispatch: Function): UpdateLoopFunction {
    const bThreadDictionary: BThreadDictionary = {};
    const eventCacheDictionary: EventCacheDictionary  = {};
    let orderedThreadIds: string[];
    const logger = new Logger();
    const dwpObj: DispatchByWait = {};
    const combinedGuardByWait: Record<string, GuardFunction> = {};
    const actionDispatch: DispatchFunction = (a: Action): void => {
        const x: DispatchedAction = {
            payload: a
        }
        dispatch(x);
    };
    const replayDispatch: ReplayDispatchFunction = (actions: Action[]): void => {
        const x: DispatchedAction = {
            replay: actions
        }
        dispatch(x);
    }
    const updateLoop: UpdateLoopFunction = (dAction: DispatchedAction | null, nextActions?: Action[] | null): ScenariosContext => {
        if (dAction) { 
            if (dAction.replay) {
                Object.keys(bThreadDictionary).forEach((threadId): void => { 
                    bThreadDictionary[threadId].onDelete();
                    delete bThreadDictionary[threadId]
                }); // delete all BThreads
                Object.keys(eventCacheDictionary).forEach((cacheId): void => { delete eventCacheDictionary[cacheId] }); // delete event-cache
                logger.resetLog(); // empty current log
                return updateLoop(null, dAction.replay); // start a replay
            }
            nextActions = dAction.payload ? [dAction.payload] : null; // select a dispatched action
        } 
        nextActions = (nextActions && nextActions.length > 0) ? nextActions : null;
        orderedThreadIds = stageBThreadsAndEventCaches(stagingFunction, bThreadDictionary, eventCacheDictionary, actionDispatch, logger);
        const threadBids = orderedThreadIds.map((id): BidDictionaries | null => bThreadDictionary[id].getBids());
        const bids = getAllBids(threadBids);
        if(!nextActions) {
            const action = getNextActionFromRequests(bids.request)
            nextActions = action ? [action] : null;  // select a requested action
        }
        if (nextActions && nextActions.length > 0) { 
            const [nextAction, ...restActions] = nextActions;
            logger.logAction(nextAction);
            advanceBThreads(bThreadDictionary, bids, nextAction);
            updateEventCache(eventCacheDictionary, nextAction);
            return updateLoop(null, restActions);
        }
        // ------ create the return value:
        logger.logWaits(bids.wait);
        logger.logPendingEvents(bids.pendingEvents);
        const dbw = dispatchByWait(actionDispatch, dwpObj, combinedGuardByWait, bids.wait);
        const bThreadStateById = Object.keys(bThreadDictionary).reduce((acc: Record<string, BThreadState>, threadId: string): Record<string, BThreadState> => {
            acc[threadId] = bThreadDictionary[threadId].state;
            return acc;
        }, {});
        const stateById = Object.keys(eventCacheDictionary).reduce((acc: Record<string, StateRef<any>>, stateId: any): Record<string, any> => {
            acc[stateId] = eventCacheDictionary[stateId].current;
            return acc;
        }, {});
        return {
            dispatch: dbw, // dispatch by wait ( ui can only waiting events )
            replay: replayDispatch, // triggers a replay
            state: stateById, // event caches
            bThreadState: bThreadStateById, // BThread state by id
            log: logger.getLog() // get all actions and reactions + pending event-names by thread-Id
        };
    };
    return updateLoop;
}