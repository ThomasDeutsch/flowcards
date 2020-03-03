import { useReducer, useRef } from "react";
import { 
    UpdateLoopFunctionType, 
    ScaffoldingFunctionType, 
    createUpdateLoop,
    getOverrides,
    Logger,
    DispatchByWait,
    OverridesByComponent,
    ExternalActions } from "@flowcards/core";


function reducer(state: ExternalActions, nextActions: ExternalActions): any {
    return nextActions;
}

export default function useScenarios(scaffoldingFn: ScaffoldingFunctionType, logger?: Logger) : [OverridesByComponent, DispatchByWait] {
    const [nextActions, dispatch] = useReducer(reducer, null);
    const updateLoopRef = useRef<null | UpdateLoopFunctionType>(null);
    if(updateLoopRef.current === null) {
        updateLoopRef.current = createUpdateLoop(scaffoldingFn, dispatch, logger);
    }
    const updateInfo = updateLoopRef.current(nextActions);
    const overrides = getOverrides(updateInfo);
    return [overrides, updateInfo.dispatchByWait];
}
