import { scenarioId, ThreadGen, BThread, ThreadDictionary, ThreadState } from './bthread';
import { getAllBids, BidArrayDictionary, BidDictionariesByType, BidType } from "./bid";
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

type EnableThreadFunctionType = (gen: ThreadGen, args: Array<any>, key?: string | number) => ThreadState;
export type ScaffoldingFunction = (e: EnableThreadFunctionType) => void;

function setupAndDeleteThreads(
    scaffolding: ScaffoldingFunction,
    threadDictionary: ThreadDictionary,
    dispatch: Function,
    logger?: Logger
): Array<string> {
    let threadIds: Set<string> = new Set();
    let orderedThreadIds: Array<string> = [];
    const enableThread: EnableThreadFunctionType = (gen: ThreadGen, args: Array<any> = [], key?: string | number): ThreadState => {
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
    Object.keys(threadDictionary).forEach(id => {
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
            let i = [...intercepts[action.eventName]];
            while(i.length) {
                const threadId = i.pop()!.threadId;
                const wasIntercepted = threadDictionary[threadId].progressWaitIntercept(BidType.intercept, action.eventName, payload);
                if(wasIntercepted) return;
            }  
        }
        waits[action.eventName].forEach(({ threadId }) => {
            threadDictionary[threadId].progressWaitIntercept(BidType.wait, action.eventName, payload);
        });
    }
}

function dispatchByWait(dispatch: Function, waits: BidArrayDictionary): DispatchByWait {
    return Object.keys(waits).reduce((acc: DispatchByWait, eventName) => {
        const allGuards = waits[eventName].filter(x => x.guard).map(x => x.guard);
        const combinedGuardFn = (val: any) => {
            if(!allGuards.length) return true;
            return allGuards.some(guard => guard!(val));
        }
        acc[eventName] = (payload?: any) => {
            if(combinedGuardFn(payload)) {
                return () => dispatch({
                    isReplay: false,
                    actions: [{ type: ActionType.waited, eventName: eventName, payload: payload }]
                } as ExternalActions);
            } else {
                return null;
            }
        }
        return acc;
    }, {});
}

export type UpdateLoopFunction = (dispatchedActions?: ExternalActions | null) => UpdateInfo;

export function createUpdateLoop(scaffolding: ScaffoldingFunction, dispatch: Function, logger?: Logger): UpdateLoopFunction {
    let threadDictionary: ThreadDictionary = {};
    let orderedThreadIds: string[];
    let bids: BidDictionariesByType;
    const setThreadsAndBids = () => {
        orderedThreadIds = setupAndDeleteThreads(scaffolding, threadDictionary, dispatch, logger);
        bids = getAllBids(orderedThreadIds.map(id => threadDictionary[id].getBids()));
    };
    setThreadsAndBids();
    const updateLoop: UpdateLoopFunction = (dispatchedActions?: ExternalActions | null): UpdateInfo => {
        let nextAction: Action | null = null;
        let remainingActions: ExternalActions | null = null;
        if (dispatchedActions && dispatchedActions.actions.length > 0) {  // external event
            if (dispatchedActions.isReplay) { // external event is a replay
                Object.keys(threadDictionary).forEach(key => delete threadDictionary[key]);
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
        } as UpdateInfo;
    };
    return updateLoop;
}