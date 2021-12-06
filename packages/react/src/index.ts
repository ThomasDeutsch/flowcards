import { useState, useRef, useMemo } from "react";
import { UpdateCallback, Behaviors, StagingCB, BehaviorContext } from "@flowcards/core";

export * from '@flowcards/core';

export function useScenarios(stagingCb: StagingCB, dependencies?: any[]): BehaviorContext {
    const [context, setContext] = useState<BehaviorContext>();
    const scenariosRef = useRef<Behaviors | null>(null);
    if(scenariosRef.current === null) {
        const updateCb: UpdateCallback = (newContext: BehaviorContext) => { setContext(newContext) }
        scenariosRef.current = new Behaviors({stagingCb, updateCb, doInitialUpdate: true});
    }
    useMemo(() => {
        if(scenariosRef.current !== null) {
            scenariosRef.current.onDepsChanged();
        }
    }, dependencies);

    return context!;
}
