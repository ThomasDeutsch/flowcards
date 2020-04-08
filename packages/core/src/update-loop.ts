/* eslint-disable @typescript-eslint/no-explicit-any */

import { scenarioId, ThreadGen, BThread, BThreadDictionary, BThreadState } from './bthread';
import { getAllBids, BidDictionariesByType, BidType, BidDictionaries, GuardFunction } from './bid';
import { Logger, Log } from './logger';
import { Action, getNextActionFromRequests, ActionType } from './action';
import { dispatchByWait, DispatchByWait } from "./dispatch-by-wait";


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
    dispatch: Record<string, Function>;
    replay: ReplayDispatchFunction;
    state: Record<string, any>;
    bThreadState: Record<string, BThreadState>;
    log: Log;
}

export interface DispatchedAction {
    replay?: Action[];
    payload?: Action;
}


function advanceBThreads(bThreadDictionary: BThreadDictionary, bids: BidDictionariesByType, action: Action): void {
    if (bids.request[action.eventName]) {
        if(action.type === ActionType.request) {
            bids.request[action.eventName].forEach((bid): void => {
                bThreadDictionary[bid.threadId].advanceRequest(action.eventName, action.payload);
            });
        } else if(action.type === ActionType.promise) {
            bids.request[action.eventName].forEach((bid): void => {
                bThreadDictionary[bid.threadId].addPromise(action.eventName, action.threadId === bid.threadId ? action.payload : null);
            });
            return;
        }
    }
    if (bids.pending[action.eventName]) {
        if(action.type === ActionType.resolve || action.type === ActionType.request) {
            bids.pending[action.eventName].forEach((bid): void => {
                bThreadDictionary[bid.threadId].advanceRequest(action.eventName, action.payload);
            });
        }
        else if(action.type === ActionType.reject) {
            bids.pending[action.eventName].forEach((bid): void => {
                bThreadDictionary[bid.threadId].rejectPromise(action.eventName, action.payload, action.threadId === bid.threadId);
            });
            return;
        }
    }
    if (bids.wait[action.eventName]) {
        if (bids.intercept[action.eventName]) {
            const i = [...bids.intercept[action.eventName]];
            while(i.length) {
                const nextThread = i.pop();
                if(nextThread) {
                    const wasIntercepted = bThreadDictionary[nextThread.threadId].progressWaitIntercept(BidType.intercept, action.eventName, action.payload);
                    if(wasIntercepted) return;
                }
            }  
        }
        bids.wait[action.eventName].forEach(({ threadId }): void => {
            bThreadDictionary[threadId].progressWaitIntercept(BidType.wait, action.eventName, action.payload);
        });
    }
}


function updateEventCache(eventCacheDictionary: EventCacheDictionary, action: Action): void {
    if ((action.type === ActionType.request) && (action.eventName in eventCacheDictionary)) {
        eventCacheDictionary[action.eventName].previous = eventCacheDictionary[action.eventName].current;
        eventCacheDictionary[action.eventName].current = action.payload;
    }
}


function setupAndDeleteBThreadsAndEventCaches(
    stagingFunction: StagingFunction,
    bThreadDictionary: BThreadDictionary,
    eventCacheDictionary: EventCacheDictionary,
    dispatch: DispatchFunction,
    logger?: Logger
): string[] {
    const threadIds: Set<string> = new Set();
    const stateIds: Set<string> = new Set();
    const orderedThreadIds: string[] = [];

    const enableBThread: EnableThreadFunctionType = (gen: ThreadGen, args?: any[], key?: string | number): BThreadState => {
        if(!args) args = [];
        const id: string = scenarioId(gen, key);
        threadIds.add(id);
        orderedThreadIds.push(id);
        if (bThreadDictionary[id]) {
            bThreadDictionary[id].resetOnArgsChange(args);
        } else {
            bThreadDictionary[id] = new BThread(gen, args, dispatch, key, logger);
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
    Object.keys(bThreadDictionary).forEach((id): void => { // delete unused threads
        const notEnabledAndNotProgressed = !threadIds.has(id) && bThreadDictionary[id].state.nrProgressions === 0;
        if (notEnabledAndNotProgressed) {
            bThreadDictionary[id].onDelete();
            delete bThreadDictionary[id];
        }
    });
    Object.keys(eventCacheDictionary).forEach((id): void => { // delete unused states
        if(!stateIds.has(id)) {
            delete eventCacheDictionary[id];
        }
    });
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
                Object.keys(bThreadDictionary).forEach((key): void => { delete bThreadDictionary[key] }); // delete all BThreads
                Object.keys(eventCacheDictionary).forEach((key): void => { delete eventCacheDictionary[key] }); // delete event-cache
                logger.resetLog(); // empty current log
                return updateLoop(null, dAction.replay); // start a replay
            }
            nextActions = dAction.payload ? [dAction.payload] : null; // select a dispatched action
        } 
        nextActions = (nextActions && nextActions.length > 0) ? nextActions : null;
        orderedThreadIds = setupAndDeleteBThreadsAndEventCaches(stagingFunction, bThreadDictionary, eventCacheDictionary, actionDispatch, logger);
        const threadBids = orderedThreadIds.map((id): BidDictionaries | null => bThreadDictionary[id].getBids());
        const bids = getAllBids(threadBids);
        if(!nextActions) {
            const action = getNextActionFromRequests(bids.request)
            nextActions = action ? [action] : null;  // select a requested action
        }
        if (nextActions && nextActions.length > 0) { 
            const [nextAction, ...restActions] = nextActions;
            if (logger) logger.logAction(nextAction);
            advanceBThreads(bThreadDictionary, bids, nextAction);
            updateEventCache(eventCacheDictionary, nextAction);
            return updateLoop(null, restActions);
        }
        // create the return value:
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