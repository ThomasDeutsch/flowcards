import { StagingFunction, createUpdateLoop, ScenariosContext } from './update-loop';
import { Action } from './action'
import { EventDispatch } from './event-dispatcher';

export * from './flow';
export * from './event-dispatcher';
export * from './bthread';
export * from './update-loop';
export * from './event-cache';
export * from "./bid";
export * from './event';
export * from './logger';
export * from './action';
export type UpdateCallback = (scenario: ScenariosContext) => any;


export function scenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback, updateInitial = false): [ScenariosContext, EventDispatch] {
    const actionQueue: Action[] = [];
    const [updateLoop, dispatch] = createUpdateLoop(stagingFunction, (action: Action): void => {
        if(action) { 
            actionQueue.push(action);
            Promise.resolve().then(() => { 
                if(actionQueue.length > 0) {
                    const nextActions = [...actionQueue];
                    actionQueue.length = 0;
                    const scenarioContext = updateLoop(nextActions);
                    if(updateCb !== undefined) updateCb(scenarioContext);
                }
            }).catch(e => false);
        }
    });
    const initialScenarioContext = updateLoop([]);
    if(updateCb !== undefined && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return [initialScenarioContext, dispatch];
}