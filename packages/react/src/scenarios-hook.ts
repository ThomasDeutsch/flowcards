import { useReducer, useRef } from "react";
import { 
    UpdateLoopFunction, 
    ScaffoldingFunction, 
    createUpdateLoop,
    ScenariosContext,
    DispatchedAction } from "@flowcards/core";


function reducer(latestAction: DispatchedAction, nextAction: DispatchedAction): DispatchedAction {
    if(latestAction.id === nextAction.id) return latestAction;
    return nextAction;
}

const initialState: DispatchedAction = { id: -1 };

export function useScenarios(scaffoldingFn: ScaffoldingFunction) : ScenariosContext {
    const [nextAction, dispatch] = useReducer(reducer, initialState);
    const updateLoopRef = useRef<null | UpdateLoopFunction>(null);
    if(updateLoopRef.current === null) {
        updateLoopRef.current = createUpdateLoop(scaffoldingFn, dispatch);
    }
    const scenarioUtils: ScenariosContext = updateLoopRef.current(nextAction, null);
    return scenarioUtils;
}
