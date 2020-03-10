import { useReducer, useRef } from "react";
import { 
    UpdateLoopFunction, 
    ScaffoldingFunction, 
    createUpdateLoop,
    Logger,
    ScenarioStates,
    DispatchedAction } from "@flowcards/core";


function reducer(latestAction: DispatchedAction, nextAction: DispatchedAction): DispatchedAction {
    if(latestAction.id === nextAction.id) return latestAction;
    return nextAction;
}

const initialActions: DispatchedAction = { id: -1 };

export function useScenarios(scaffoldingFn: ScaffoldingFunction, logger?: Logger) : ScenarioStates {
    const [nextAction, dispatch] = useReducer(reducer, initialActions);
    const updateLoopRef = useRef<null | UpdateLoopFunction>(null);
    if(updateLoopRef.current === null) {
        updateLoopRef.current = createUpdateLoop(scaffoldingFn, dispatch, logger);
    }
    const scenarioStates = updateLoopRef.current(nextAction, null);
    return scenarioStates;
}
