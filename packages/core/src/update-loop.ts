/* eslint-disable @typescript-eslint/no-explicit-any */

import { scenarioId, ThreadGen, BThread, ThreadDictionary, ThreadState } from './bthread';
import { getAllBids, BidArrayDictionary, BidDictionariesByType, BidType, BidDictionaries } from './bid';
import { Logger } from "./logger";
import { Action, getNextActionFromRequests } from "./action";
import { dispatchByWait } from "./dispatch-by-wait";
import { getOverridesByComponentName, OverridesByComponent } from './overrides';


// -----------------------------------------------------------------------------------
// ADVANCE THREADS

function advanceThreads(
    threadDictionary: ThreadDictionary,
    waits: BidArrayDictionary,
    intercepts: BidArrayDictionary,
    action: Action
): void {
    let wasAsyncRequest,
        payload = action.payload;
    if (action.threadId && threadDictionary[action.threadId]) {
        [payload, wasAsyncRequest] = threadDictionary[action.threadId].progressRequestResolve(action.type, action.eventName, payload);
    }
    if (!wasAsyncRequest && waits[action.eventName] && waits[action.eventName].length) {
        if (intercepts[action.eventName]) {
            const i = [...intercepts[action.eventName]];
            while(i.length) {
                const nextThread = i.pop();
                if(nextThread) {
                    const wasIntercepted = threadDictionary[nextThread.threadId].progressWaitIntercept(BidType.intercept, action.eventName, payload);
                    if(wasIntercepted) return;
                }
            }  
        }
        waits[action.eventName].forEach(({ threadId }): void => {
            threadDictionary[threadId].progressWaitIntercept(BidType.wait, action.eventName, payload);
        });
    }
}


// -----------------------------------------------------------------------------------
// UPDATE & DELETE THREADS


type EnableThreadFunctionType = (gen: ThreadGen, args?: any[], key?: string | number) => ThreadState;

export type ScaffoldingFunction = (e: EnableThreadFunctionType) => void;

export type DispatchFunction = (action: Action) => void;


function setupAndDeleteThreads(
    scaffolding: ScaffoldingFunction,
    threadDictionary: ThreadDictionary,
    dispatch: DispatchFunction,
    logger?: Logger
): string[] {
    const threadIds: Set<string> = new Set();
    const orderedThreadIds: string[] = [];

    const enableThread: EnableThreadFunctionType = (gen: ThreadGen, args?: any[], key?: string | number): ThreadState => {
        if(!args) args = [];
        const id: string = scenarioId(gen, key);
        threadIds.add(id);
        orderedThreadIds.push(id);
        if (threadDictionary[id]) {
            threadDictionary[id].resetOnArgsChange(args);
        } else {
            threadDictionary[id] = new BThread(gen, args, dispatch, key, logger);
        }
        return threadDictionary[id].state;
    };

    scaffolding(enableThread); // enable threads
    Object.keys(threadDictionary).forEach((id): void => {
        const notEnabledAndNotProgressed = !threadIds.has(id) && threadDictionary[id].nrProgressions === 0;
        if (notEnabledAndNotProgressed) {
            threadDictionary[id].onDelete();
            delete threadDictionary[id]; // delete unused threads
        }
    });
    return orderedThreadIds;
}


// -----------------------------------------------------------------------------------
// UPDATE LOOP

type ReplayDispatchFunction = (actions: Action[]) => void;

export interface ScenarioUtils {
    dispatchByWait: Record<string, Function>;
    replay: ReplayDispatchFunction;
    overrides: OverridesByComponent;
    thread: Record<string,ThreadState>;
}

export interface DispatchedAction {
    id: number;
    replay?: Action[];
    payload?: Action;
}

export type UpdateLoopFunction = (dAction: DispatchedAction | null, nextActions?: Action[] | null) => ScenarioUtils;


export function createUpdateLoop(scaffolding: ScaffoldingFunction, dispatch: Function, logger?: Logger): UpdateLoopFunction {
    const threadDictionary: ThreadDictionary = {};
    let orderedThreadIds: string[];
    let bids: BidDictionariesByType;
    let loopCount = 0;

    const actionDispatch: DispatchFunction = (a: Action): void => {
        const x: DispatchedAction = {
            id: loopCount+1,
            payload: a
        }
        dispatch(x);
    };

    const replayDispatch: ReplayDispatchFunction = (actions: Action[]): void => {
        const x: DispatchedAction = {
            id: loopCount+1,
            replay: actions
        }
        dispatch(x);
    }

    const setThreadsAndBids = (): void => {
        orderedThreadIds = setupAndDeleteThreads(scaffolding, threadDictionary, actionDispatch, logger);
        bids = getAllBids(orderedThreadIds.map((id): BidDictionaries | null => threadDictionary[id].getBids()));
    };

    setThreadsAndBids(); // initial setup

    const updateLoop: UpdateLoopFunction = (dAction: DispatchedAction | null, nextActions?: Action[] | null): ScenarioUtils => {
        loopCount++;
        if (dAction && (dAction.id === loopCount)) {
            if (dAction.replay) {
                Object.keys(threadDictionary).forEach((key): void => { delete threadDictionary[key] });
                setThreadsAndBids();
                return updateLoop(null, dAction.replay); // start a replay
            }
            nextActions = dAction.payload ? [dAction.payload] : null; // select a dispatched action
        } 
        if(!nextActions || nextActions.length === 0) {
            const action = getNextActionFromRequests(bids.request)
            nextActions = action ? [action] : null;  // select a requested action
        }
        if(!nextActions && dAction && (dAction.id !== loopCount)) { // component was reloaded
            setThreadsAndBids(); // do this, because component-props might have been changed
            return updateLoop(null);
        }
        if (nextActions && nextActions.length > 0) { 
            const [nextAction, ...restActions] = nextActions;
            if (logger) logger.logAction(nextAction);
            advanceThreads(threadDictionary, bids.wait, bids.intercept, nextAction);
            setThreadsAndBids();
            return updateLoop(null, restActions);
        }
        const dbw = dispatchByWait(actionDispatch, bids.wait)
        return {
            dispatchByWait: dbw,
            replay: replayDispatch,
            overrides: getOverridesByComponentName(orderedThreadIds, dbw, threadDictionary),
            thread: Object.keys(threadDictionary).reduce((acc: Record<string, ThreadState>, threadId: string): Record<string, ThreadState> => {
                acc[threadId] = threadDictionary[threadId].state;
                return acc;
            }, {})
        };
    };
    return updateLoop;
}