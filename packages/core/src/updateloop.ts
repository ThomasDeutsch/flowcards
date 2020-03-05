/* eslint-disable @typescript-eslint/no-explicit-any */

import { scenarioId, ThreadGen, BThread, ThreadDictionary, ThreadState } from './bthread';
import { getAllBids, BidArrayDictionary, BidDictionariesByType, BidType, Bid, BidDictionaries } from './bid';
import * as utils from "./utils";
import { Logger } from "./logger";
import { Action, getNextActionFromRequests, ExternalActions, ActionType } from "./action";

export interface DispatchByWait {
    [Key: string]: Function;
}

export interface UpdateInfo {
    orderedThreadIds: string[];
    dispatchByWait: DispatchByWait;
    threadDictionary: ThreadDictionary;
}

type EnableThreadFunctionType = (gen: ThreadGen, args?: any[], key?: string | number) => ThreadState;
export type ScaffoldingFunction = (e: EnableThreadFunctionType) => void;

function setupAndDeleteThreads(
    scaffolding: ScaffoldingFunction,
    threadDictionary: ThreadDictionary,
    dispatch: Function,
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

function dispatchByWait(dispatch: Function, waits: BidArrayDictionary): DispatchByWait {
    return Object.keys(waits).reduce((acc: DispatchByWait, eventName): DispatchByWait => {
        const allGuards = waits[eventName].reduce((acc: Function[], curr: Bid): Function[] => {
            if(curr.guard) {
                acc.push(curr.guard);
            }
            return acc;
        }, []);
        const combinedGuardFn = (val: any): boolean => {
            if(allGuards.length === 0) return true;
            return allGuards.some((guard): boolean => guard(val));
        }
        acc[eventName] = (payload?: any): Function | null => {
            if(combinedGuardFn(payload)) {
                return (): Function => dispatch({
                    isReplay: false,
                    actions: [{ type: ActionType.waited, eventName: eventName, payload: payload }]
                });
            } else {
                return null;
            }
        }
        return acc;
    }, {});
}

export type UpdateLoopFunction = (dispatchedActions?: ExternalActions | null) => UpdateInfo;

export function createUpdateLoop(scaffolding: ScaffoldingFunction, dispatch: Function, logger?: Logger): UpdateLoopFunction {
    const threadDictionary: ThreadDictionary = {};
    let orderedThreadIds: string[];
    let bids: BidDictionariesByType;
    const setThreadsAndBids = (): void => {
        orderedThreadIds = setupAndDeleteThreads(scaffolding, threadDictionary, dispatch, logger);
        bids = getAllBids(orderedThreadIds.map((id): BidDictionaries | null => threadDictionary[id].getBids()));
    };
    setThreadsAndBids();
    const updateLoop: UpdateLoopFunction = (dispatchedActions?: ExternalActions | null): UpdateInfo => {
        let nextAction: Action | null = null;
        let remainingActions: ExternalActions | null = null;
        if (dispatchedActions && dispatchedActions.actions.length > 0) {  // external event
            if (dispatchedActions.isReplay) { // external event is a replay
                Object.keys(threadDictionary).forEach((key): void => { delete threadDictionary[key] });
                setThreadsAndBids();
            }
            nextAction = dispatchedActions.actions[0];
            remainingActions = {
                isReplay: false,
                actions: utils.dropFirst(dispatchedActions.actions)
            };
        } else {
            nextAction = getNextActionFromRequests(bids.request);
        }
        if (nextAction) {
            if (logger) logger.logAction(nextAction);
            advanceThreads(threadDictionary, bids.wait, bids.intercept, nextAction);
            setThreadsAndBids();
            return updateLoop(remainingActions);
        }
        return {
            orderedThreadIds: orderedThreadIds,
            dispatchByWait: dispatchByWait(dispatch, bids.wait),
            threadDictionary: threadDictionary
        };
    };
    return updateLoop;
}