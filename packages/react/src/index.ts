import { useState, useRef } from "react";
import { StagingFunction, ScenariosContext, scenarios, EventDispatch, StartReplay } from "@flowcards/core";

export * from '@flowcards/core';

export function useScenarios(stagingFunction: StagingFunction): [ScenariosContext, EventDispatch, StartReplay] {
    const [state, setState] = useState<ScenariosContext>();
    const ref = useRef<[ScenariosContext, EventDispatch, StartReplay] | null>(null);
    if(ref.current === null) {
        ref.current = scenarios(stagingFunction, (a: ScenariosContext): void => { setState(a) })
    }
    return [state || ref.current[0], ref.current[1], ref.current[2]];
}