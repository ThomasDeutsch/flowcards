import { useReducer, useRef } from "react";
import { 
    UpdateLoopFunctionType, 
    ScaffoldingFunctionType, 
    createUpdateLoop,
    getOverrides,
    Logger,
    DispatchByWait,
    OverridesByComponentType,
    ExternalAction } from "@flowcards/core";


function reducer(state: ExternalAction, nextActions: ExternalAction): any {
    return nextActions;
}

export default function useScenarios(scaffoldingFn: ScaffoldingFunctionType, logger?: Logger) : [OverridesByComponentType, DispatchByWait] {
    const [nextActions, dispatch] = useReducer(reducer, null);
    const updateLoopRef = useRef<null | UpdateLoopFunctionType>(null);
    if(updateLoopRef.current === null) {
        updateLoopRef.current = createUpdateLoop(scaffoldingFn, dispatch, logger);
    }
    const updateInfo = updateLoopRef.current(nextActions);
    const overrides = getOverrides(updateInfo);
    return [overrides, updateInfo.dispatchByWait];
}
