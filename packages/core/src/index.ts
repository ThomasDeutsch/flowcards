/* eslint-disable @typescript-eslint/no-explicit-any */

import { ScaffoldingFunction, createUpdateLoop, ScenariosContext, DispatchedAction } from './update-loop';
type UpdateCallback = (scenario: ScenariosContext) => any;

export { BTContext, ThreadState } from './bthread';
export { UpdateLoopFunction, ScaffoldingFunction, createUpdateLoop, DispatchedAction, ScenariosContext, StateRef } from './update-loop';
export { wait, intercept, block, request } from "./bid";
export { DispatchByWait, GuardedDispatch, TriggerDispatch } from './dispatch-by-wait';

export function scenarios(scaffoldingFn: ScaffoldingFunction, updateCb?: UpdateCallback | null): void {
    const updateLoop = createUpdateLoop(scaffoldingFn, (a: DispatchedAction): void => {
        const scenario: ScenariosContext = updateLoop(a);
        if(updateCb) updateCb(scenario);
    });
    const states = updateLoop(null);
    if(updateCb) updateCb(states);
}