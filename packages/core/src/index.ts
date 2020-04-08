/* eslint-disable @typescript-eslint/no-explicit-any */

import { ScaffoldingFunction, createUpdateLoop, ScenariosContext, DispatchedAction } from './update-loop';
export type UpdateCallback = (scenario: ScenariosContext) => any;
export { BTContext, ThreadState } from './bthread';
export { UpdateLoopFunction, ScaffoldingFunction, createUpdateLoop, DispatchedAction, ScenariosContext, StateRef } from './update-loop';
export { wait, intercept, block, request } from "./bid";
export { DispatchByWait, GuardedDispatch, TriggerDispatch } from './dispatch-by-wait';


export function scenarios(scaffoldingFn: ScaffoldingFunction, updateCb: UpdateCallback | null, updateInitial: boolean = true): ScenariosContext {
    const updateLoop = createUpdateLoop(scaffoldingFn, (a: DispatchedAction): void => {
        const scenarioContext = updateLoop(a)
        if(updateCb !== null) updateCb(scenarioContext);
    });
    const initialScenarioContext = updateLoop(null);
    if(updateCb !== null && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return initialScenarioContext;
}