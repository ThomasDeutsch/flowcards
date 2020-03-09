import { useReducer, useRef } from "react";
import { 
    UpdateLoopFunction, 
    ScaffoldingFunction, 
    createUpdateLoop,
    Logger,
    ScenarioStates,
    DispatchedActions } from "@flowcards/core";


function reducer(state: DispatchedActions, nextActions: DispatchedActions): DispatchedActions {
    return nextActions;
}

export function useScenarios(scaffoldingFn: ScaffoldingFunction, logger?: Logger) : ScenarioStates {
    const [nextActions, dispatch] = useReducer(reducer, { isReplay: false, actions: []});
    const updateLoopRef = useRef<null | UpdateLoopFunction>(null);
    if(updateLoopRef.current === null) {
        updateLoopRef.current = createUpdateLoop(scaffoldingFn, dispatch, logger);
    }
    const scenarioStates = updateLoopRef.current(nextActions);
    return scenarioStates;
}
