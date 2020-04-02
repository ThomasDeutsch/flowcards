/* eslint-disable @typescript-eslint/no-explicit-any */

import { ScaffoldingFunction, createUpdateLoop, Scenario, DispatchedAction } from './update-loop';
type UpdateCallback = (scenario: Scenario) => any;


export { OverridesByComponent } from './overrides';
export { BTContext } from './bthread';
export { UpdateLoopFunction, ScaffoldingFunction, createUpdateLoop, DispatchedAction, Scenario, StateRef } from './update-loop';
export { wait, intercept, block, request } from "./bid";
export { DispatchByWait } from './dispatch-by-wait';

export function scenarios(enable: ScaffoldingFunction, updateCb?: UpdateCallback | null): void {
    const updateLoop = createUpdateLoop(enable, (a: DispatchedAction): void => {
        const scenario: Scenario = updateLoop(a);
        if(updateCb) updateCb(scenario);
    });
    const states = updateLoop(null);
    if(updateCb) updateCb(states);
}