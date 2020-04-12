/* eslint-disable @typescript-eslint/no-explicit-any */

import { StagingFunction, createUpdateLoop, ScenariosContext } from './update-loop';
import { Action } from './action'

export { BTContext, BThreadState } from './bthread';
export { UpdateLoopFunction, StagingFunction, createUpdateLoop, ScenariosContext, StateRef } from './update-loop';
export { wait, intercept, block, request, Bid, EventName } from "./bid";
export { DispatchByWait, GuardedDispatch, TriggerDispatch } from './dispatch-by-wait';
export { Log, ActionAndReactions, ThreadsByWait} from './logger';
export { Action } from './action';
export { Reaction } from './reaction';

export type UpdateCallback = (scenario: ScenariosContext) => any;

export function scenarios(stagingFunction: StagingFunction, updateCb: UpdateCallback | null, updateInitial: boolean = true): ScenariosContext {
    const updateLoop = createUpdateLoop(stagingFunction, (a: Action): void => {
        const scenarioContext = updateLoop(a)
        if(updateCb !== null) updateCb(scenarioContext);
    });
    const initialScenarioContext = updateLoop(null);
    if(updateCb !== null && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return initialScenarioContext;
}
