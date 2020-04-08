import { useState } from "react";
import { ScaffoldingFunction, ScenariosContext, scenarios } from "@flowcards/core";
import { DispatchedAction } from '../../core/build/update-loop';



export function useScenarios(scaffoldingFn: ScaffoldingFunction) : ScenariosContext {
    const [state, setState] = useState((): ScenariosContext => scenarios(scaffoldingFn, (a: ScenariosContext): void => { setState(a) }, false));
    return state;
}


// Example: solution for using a useReducer instead of useState
// export function useScenarios(scaffoldingFn: ScaffoldingFunction) : ScenariosContext | null {
//     const [state, dispatch] = useReducer((): ScenariosContext | null => scenarios(scaffoldingFn, dispatch), null);
//     return state;
// }