import { useState } from "react";
import { ScaffoldingFunction, ScenariosContext, scenarios } from "@flowcards/core";

export * from '@flowcards/core';

export function useScenarios(scaffoldingFn: ScaffoldingFunction) : ScenariosContext {
    const [state, setState] = useState((): ScenariosContext => scenarios(scaffoldingFn, (a: ScenariosContext): void => { setState(a) }, false));
    return state;
}