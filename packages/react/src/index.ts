import { useState, useRef, useMemo } from "react";
import { StagingFunction, ScenariosContext, ScenariosDispatch } from "@flowcards/core";
import { Scenarios } from '../../core/src/index';

export * from '@flowcards/core';

export function useScenarios(stagingFunction: StagingFunction, dependencies: any[]): [ScenariosContext, ScenariosDispatch] {
    const [context, setContext] = useState<ScenariosContext>();
    const scenariosRef = useRef<Scenarios | null>(null);
    useMemo(() => {
        if(scenariosRef.current !== null) { // do not run this for the initial dependencies
            scenariosRef.current.dispatch({type: 'contextChange'});
        }
    }, dependencies);
    if(scenariosRef.current === null) { // only to this once
        scenariosRef.current = new Scenarios(stagingFunction, (a: ScenariosContext): void => { setContext(a) })
    }
    return [context || scenariosRef.current.initialScenariosContext, scenariosRef.current.dispatch];
}