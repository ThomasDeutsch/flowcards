import { useState } from "react";
import { StagingFunction, ScenariosContext, scenarios } from "@flowcards/core";

export * from '@flowcards/core';

export function useScenarios(stagingFunction: StagingFunction) : ScenariosContext {
    const [state, setState] = useState((): ScenariosContext => scenarios(stagingFunction, (a: ScenariosContext): void => { setState(a) }, false));
    return state;
}

export { Logger } from './logger.component';