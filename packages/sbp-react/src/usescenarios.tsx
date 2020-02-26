import { useReducer, useRef } from "../packages/sbp-core/sbp-react/react";
import { UpdateLoopFunctionType, ScaffoldingFunctionType, createUpdateLoop } from "../../sbp-core/src/updateloop";
import { getOverrides } from "../../sbp-core/src/overrideinfo";
import { Logger } from "../../sbp-core/src/logger";
import { ExternalAction } from "../packages/sbp-core/core/action";

function reducer(state: ExternalAction, nextActions: ExternalAction): any {
    return nextActions;
}

export default function useScenarios(scaffoldingFn: ScaffoldingFunctionType, logger?: Logger) {
    const [nextActions, dispatch] = useReducer(reducer, null);
    const updateLoopRef = useRef<null | UpdateLoopFunctionType>(null);
    if(updateLoopRef.current === null) {
        updateLoopRef.current = createUpdateLoop(scaffoldingFn, dispatch, logger);
    }
    const updateInfo = updateLoopRef.current(nextActions);
    const overrides = getOverrides(updateInfo);
    return [overrides, updateInfo.dispatchByWait];
}
