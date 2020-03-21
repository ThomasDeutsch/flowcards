/* eslint-disable @typescript-eslint/no-explicit-any */

import { ScaffoldingFunction, createUpdateLoop, Scenario, DispatchedAction } from './update-loop';
import { Logger } from "./logger";

type UpdateCallback = (scenario: Scenario) => any;



export { OverridesByComponent } from './overrides';
export { ThreadContext } from './bthread';
export { UpdateLoopFunction, ScaffoldingFunction, createUpdateLoop, DispatchedAction, Scenario } from './update-loop';
export { Logger } from "./logger";
export { wait, intercept, block, request } from "./bid";
export { DispatchByWait } from './dispatch-by-wait';



export function scenarios(enable: ScaffoldingFunction, updateCb?: UpdateCallback | null, logger?: Logger): void {
    const updateLoop = createUpdateLoop(enable, (a: DispatchedAction): void => {
        const scenario: Scenario = updateLoop(a);
        if(updateCb) updateCb(scenario);
    }, logger);
    const states = updateLoop(null);
    if(updateCb) updateCb(states);
}