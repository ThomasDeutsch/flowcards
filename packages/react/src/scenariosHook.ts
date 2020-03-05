import { useReducer, useRef } from "react";
import { 
    UpdateLoopFunction, 
    ScaffoldingFunction, 
    createUpdateLoop,
    getOverrides,
    Logger,
    DispatchByWait,
    OverridesByComponent,
    ExternalActions } from "@flowcards/core";


function reducer(state: ExternalActions, nextActions: ExternalActions): ExternalActions {
    return nextActions;
}

export default function useScenarios(scaffoldingFn: ScaffoldingFunction, logger?: Logger) : [OverridesByComponent, DispatchByWait] {
    const [nextActions, dispatch] = useReducer(reducer, { isReplay: false, actions: []});
    const updateLoopRef = useRef<null | UpdateLoopFunction>(null);
    if(updateLoopRef.current === null) {
        updateLoopRef.current = createUpdateLoop(scaffoldingFn, dispatch, logger);
    }
    const updateInfo = updateLoopRef.current(nextActions);
    const overrides = getOverrides(updateInfo);
    return [overrides, updateInfo.dispatchByWait];
}
