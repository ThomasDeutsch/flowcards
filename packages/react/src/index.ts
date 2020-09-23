import { useState, useRef, useMemo } from "react";
import { StagingFunction, ScenariosContext, scenarios, DispatchActions, PlayPause, CONTEXT_CHANGED } from "@flowcards/core";

export * from '@flowcards/core';

export function useScenarios(stagingFunction: StagingFunction, dependencies: any[]): [ScenariosContext, DispatchActions, PlayPause] {
    const [state, setState] = useState<ScenariosContext>();
    const ref = useRef<[ScenariosContext, DispatchActions, PlayPause] | null>(null);
    if(ref.current === null) {
        ref.current = scenarios(stagingFunction, (a: ScenariosContext): void => { setState(a) })
    }
    useMemo(() => {
        if(ref.current) ref.current[1](CONTEXT_CHANGED); // dispatch a CONTEXT_CHANGED symbol
    }, dependencies);
    return [state || ref.current[0], ref.current[1], ref.current[2]];
}