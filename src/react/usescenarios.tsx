import { useReducer, useRef } from "react";
import bp from "./bp/index";

function reducer(state: any, nextActions: any): any {
    state = nextActions;
    return state;
}

export default function useScenarios(enable: Function, logger?: any) {
    const [state, dispatch] = useReducer(reducer, null);
    const updateLoopRef = useRef<null | Function>(null);
    if(updateLoopRef.current === null) {
        updateLoopRef.current = bp.createUpdateLoop(enable, dispatch, logger);
    }
    const updateInfo = updateLoopRef.current(state);
    const overrides = bp.getOverrides(updateInfo);
    return [overrides, updateInfo.dispatchByWait];
}
