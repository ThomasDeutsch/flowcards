import { useState, useRef, useMemo } from "react";
import { Scenarios, UpdateCallback, StagingFunction, ScenariosContext, DispatchCommand } from "@flowcards/core";
export * from '@flowcards/core';

export function useScenarios(stagingFunction: StagingFunction, dependencies: any[]): [ScenariosContext, DispatchCommand] {
    const [context, setContext] = useState<ScenariosContext>();
    const scenariosRef = useRef<Scenarios | null>(null);
    if(scenariosRef.current === null) { 
        const updateCallback: UpdateCallback = (newContext: ScenariosContext) => { setContext(newContext) }
        scenariosRef.current = new Scenarios(stagingFunction, updateCallback);
    }
    useMemo(() => {
        if(scenariosRef.current !== null) { 
            scenariosRef.current.dispatch({type: 'appContextChange'});
        }
    }, dependencies);

    return [context || scenariosRef.current.initialScenariosContext, scenariosRef.current.dispatch];
}