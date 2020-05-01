import { StagingFunction, createUpdateLoop, ScenariosContext } from '../src/update-loop';
import { Action } from '../src/action'
export type UpdateCallback = (scenario: ScenariosContext) => any;


export function scenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback, updateInitial: boolean = true): ScenariosContext {
    const [updateLoop] = createUpdateLoop(stagingFunction, (a: Action): void => {
        const scenarioContext = updateLoop(a);
        if(updateCb !== undefined) updateCb(scenarioContext);
    });
    const initialScenarioContext = updateLoop();
    if(updateCb !== undefined && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return initialScenarioContext;
}