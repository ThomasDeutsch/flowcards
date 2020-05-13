import { useState, useRef } from "react";
import { StagingFunction, ScenariosContext, scenarios, EventDispatch } from "@flowcards/core";

export * from '@flowcards/core';

export function useScenarios(stagingFunction: StagingFunction): [ScenariosContext, EventDispatch] {
    const ref = useRef(scenarios(stagingFunction, (a: ScenariosContext): void => { setState(a) }));
    const [state, setState] = useState(ref.current[0]);
    return [state, ref.current[1]];
}