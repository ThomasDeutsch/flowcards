import { useState, useRef, useMemo } from "react";
import { StagingFunction, ScenariosContext, DispatchActions, CONTEXT_CHANGED } from "@flowcards/core";
import { Scenarios } from '../../core/src/index';

export * from '@flowcards/core';

export function useScenarios(stagingFunction: StagingFunction, dependencies: any[]): [ScenariosContext, DispatchActions] {
    const [state, setState] = useState<ScenariosContext>();
    const ref = useRef<Scenarios | null>(null);
    if(ref.current === null) {
        ref.current = new Scenarios(stagingFunction, (a: ScenariosContext): void => { setState(a) })
    }
    useMemo(() => {
        if(ref.current) ref.current.dispatchActions(CONTEXT_CHANGED); // dispatch a CONTEXT_CHANGED symbol
    }, dependencies);

    return [state || ref.current.initialScenariosContext, ref.current.dispatchActions];
}