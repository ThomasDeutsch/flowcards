/* eslint-disable @typescript-eslint/no-explicit-any */


import { ScaffoldingFunction, createUpdateLoop, ScenarioStates, DispatchedAction } from './update-loop';
import { Logger } from "./logger";

type UpdateCallback = (states: ScenarioStates) => any;

export function scenarios(enable: ScaffoldingFunction, updateCb?: UpdateCallback | null, logger?: Logger): void {
    const updateLoop = createUpdateLoop(enable, (a: DispatchedAction): void => {
        const states = updateLoop(a);
        if(updateCb) updateCb(states);
    }, logger);
    const states = updateLoop(null);
    if(updateCb) updateCb(states);
}

export { OverridesByComponent } from './overrides';
export { ThreadContext } from './bthread';
export { UpdateLoopFunction, ScaffoldingFunction, createUpdateLoop, DispatchedAction, ScenarioStates } from './update-loop';
export { Logger } from "./logger";
export { wait, intercept, block, request } from "./bid";
export { DispatchByWait } from './dispatch-by-wait';