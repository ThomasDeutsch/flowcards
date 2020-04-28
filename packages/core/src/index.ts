import { StagingFunction, createUpdateLoop, ScenariosContext } from './update-loop';
import { Action } from './action'

export { BTContext, BThreadState, BTGen } from './bthread';
export { UpdateLoopFunction, StagingFunction, createUpdateLoop, ScenariosContext, StateRef } from './update-loop';
export { wait, intercept, block, request, Bid } from "./bid";
export { Log, ActionAndReactions, ThreadsByWait} from './logger';
export { Action } from './action';
export { Reaction } from './reaction';
export type UpdateCallback = (scenario: ScenariosContext) => any;

export function scenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback, updateInitial: boolean = true): ScenariosContext {
    const updateLoop = createUpdateLoop(stagingFunction, (a: Action): void => {
        const scenarioContext = updateLoop(a)
        if(updateCb !== undefined) updateCb(scenarioContext);
    });
    const initialScenarioContext = updateLoop();
    if(updateCb !== undefined && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return initialScenarioContext;
}
