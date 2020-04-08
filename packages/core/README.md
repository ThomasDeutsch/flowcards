## @flowcards/core

The flowcards core package has one main function. It will initialize an update-loop.<br/>
 ```ts
 export function scenarios(stagingFunction: StagingFunction, updateCb: UpdateCallback | null, updateInitial: boolean = true): ScenariosContext {
    const updateLoop = createUpdateLoop(stagingFunction, (a: DispatchedAction): void => {
        const scenarioContext = updateLoop(a)
        if(updateCb !== null) updateCb(scenarioContext);
    });
    const initialScenarioContext = updateLoop(null);
    if(updateCb !== null && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return initialScenarioContext;
}
 ```

![Solution Architecture](/docs/img/update-loop-chart.svg "solution architecture").
