import { Action } from './action';
import { EventDispatch } from './event-dispatcher';
import { createUpdateLoop, ScenariosContext, StagingFunction } from './update-loop';

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
    const [updateLoop, dispatch, actionQueue] = createUpdateLoop(stagingFunction, (action: Action): void => {
        if(action) { 
            actionQueue.push(action);
            Promise.resolve().then(() => { 
                const scenarioContext = updateLoop();
                if(updateCb !== undefined) updateCb(scenarioContext);
            }).catch(e => false);
        }
    });
    const initialScenarioContext = updateLoop();
    if(updateCb !== undefined && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return [initialScenarioContext, dispatch];
}