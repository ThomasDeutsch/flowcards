import { ScaffoldingFunction, createUpdateLoop, DispatchedActions, UpdateInfo } from './update-loop';
import { Logger } from "./logger";

export function scenarios(enable: ScaffoldingFunction, logger?: Logger): Function {
    const updateLoop = createUpdateLoop(enable, (a: DispatchedActions): UpdateInfo => updateLoop(a), logger);
    updateLoop();
    return (a: DispatchedActions):UpdateInfo => updateLoop(a);
}

export { ThreadContext } from './bthread';
export { UpdateLoopFunction, ScaffoldingFunction, createUpdateLoop, DispatchedActions, UpdateInfo } from './update-loop';
export { getOverrides, OverridesByComponent } from "./override-info";
export { Logger } from "./logger";
export { wait, intercept, block, request } from "./bid";
export { DispatchByWait } from './dispatch-by-wait';