import { useReducer, useRef } from "react";
import { 
    UpdateLoopFunction, 
    ScaffoldingFunction, 
    createUpdateLoop,
    Scenario,
    DispatchedAction } from "@flowcards/core";


function reducer(latestAction: DispatchedAction, nextAction: DispatchedAction): DispatchedAction {
    if(latestAction.id === nextAction.id) return latestAction;
    return nextAction;
}

const initialState: DispatchedAction = { id: -1 };

export function useScenarios(scaffoldingFn: ScaffoldingFunction) : Scenario {
    const [nextAction, dispatch] = useReducer(reducer, initialState);
    const updateLoopRef = useRef<null | UpdateLoopFunction>(null);
    if(updateLoopRef.current === null) {
        updateLoopRef.current = createUpdateLoop(scaffoldingFn, dispatch);
    }
    const scenarioUtils: Scenario = updateLoopRef.current(nextAction, null);
    return scenarioUtils;
}
