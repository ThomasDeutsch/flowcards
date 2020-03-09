/* eslint-disable @typescript-eslint/no-explicit-any */


import { ScaffoldingFunction, createUpdateLoop, DispatchedActions, ScenarioStates } from './update-loop';
import { Logger } from "./logger";

type UpdateCallback = (states: ScenarioStates) => any;

export function scenarios(enable: ScaffoldingFunction, updateCb?: UpdateCallback, logger?: Logger): void {
    const updateLoop = createUpdateLoop(enable, (a: DispatchedActions): void => {
        const info = updateLoop(a);
        if(updateCb) updateCb(info);
    }, logger);
    const initialInfo = updateLoop();
    if(updateCb) updateCb(initialInfo);
}

export { OverridesByComponent } from './overrides';
export { ThreadContext } from './bthread';
export { UpdateLoopFunction, ScaffoldingFunction, createUpdateLoop, DispatchedActions, ScenarioStates } from './update-loop';
export { Logger } from "./logger";
export { wait, intercept, block, request } from "./bid";
export { DispatchByWait } from './dispatch-by-wait';