import { useState, useRef } from "react";
import { StagingFunction, ScenariosContext, scenarios, DispatchActions, PlayPause } from "@flowcards/core";

export * from '@flowcards/core';

export function useScenarios(stagingFunction: StagingFunction): [ScenariosContext, DispatchActions, PlayPause] {
    const [state, setState] = useState<ScenariosContext>();
    const ref = useRef<[ScenariosContext, DispatchActions, PlayPause] | null>(null);
    if(ref.current === null) {
        ref.current = scenarios(stagingFunction, (a: ScenariosContext): void => { setState(a) })
    }
    return [state || ref.current[0], ref.current[1], ref.current[2]];
}