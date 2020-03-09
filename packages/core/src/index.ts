import { ScaffoldingFunction, createUpdateLoop, DispatchedActions } from './update-loop';
import { Logger } from "./logger";

export function scenarios(enable: ScaffoldingFunction, updateCb?: Function, logger?: Logger): void {
    const updateLoop = createUpdateLoop(enable, (a: DispatchedActions): void => {
        const info = updateLoop(a);
        if(updateCb) updateCb(info);
    }, logger);
    const initialInfo = updateLoop();
    if(updateCb) updateCb(initialInfo);
}

export { ThreadContext } from './bthread';
export { UpdateLoopFunction, ScaffoldingFunction, createUpdateLoop, DispatchedActions, UpdateInfo } from './update-loop';
export { getOverrides, OverridesByComponent } from "./override-info";
export { Logger } from "./logger";
export { wait, intercept, block, request } from "./bid";
export { DispatchByWait } from './dispatch-by-wait';