import { useState, useRef, useMemo } from "react";
import { StagingFunction, ScenariosContext, ScenariosDispatch } from "@flowcards/core";
import { Scenarios } from '../../core/src/index';

export * from '@flowcards/core';

export function useScenarios(stagingFunction: StagingFunction, dependencies: any[]): [ScenariosContext, ScenariosDispatch] {
    const [state, setState] = useState<ScenariosContext>();
    const ref = useRef<Scenarios | null>(null);
    useMemo(() => {
        if(ref.current !== null) { // do not run this for the initial dependencies
            ref.current.dispatch({type: 'contextChange'});
        }
    }, dependencies);
    if(ref.current === null) {
        ref.current = new Scenarios(stagingFunction, (a: ScenariosContext): void => { setState(a) })
    }
    return [state || ref.current.initialScenariosContext, ref.current.dispatch];
}