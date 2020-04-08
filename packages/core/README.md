## @flowcards/core

The flowcards core package has one main `scenarios` function.<br/>
It will create an update-loop and make the initial setup call.<br/>
When ever there is a new update, the update callback gets called with an updated scenarios-context that includes a dispatcher.<br/>

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
