import { StagingFunction, createUpdateLoop, ScenariosContext } from './update-loop';
import { Action } from './action'
import { EventDispatch } from './event-dispatcher';

export { EventDispatch } from './event-dispatcher';
export { BTContext, BThreadState, BTGen } from './bthread';
export { UpdateLoopFunction, StagingFunction, createUpdateLoop, ScenariosContext, Ref } from './update-loop';
export { wait, intercept, block, request, Bid } from "./bid";
export { FCEvent, toEvent } from './event';
export { Log, ActionAndReactions, ThreadsByWait} from './logger';
export { Action } from './action';
export { Reaction } from './reaction';
export type UpdateCallback = (scenario: ScenariosContext) => any;

export function scenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback, updateInitial = false): [ScenariosContext, EventDispatch] {
    let actionQueue: Action[] = [];
    const [updateLoop, dispatch] = createUpdateLoop(stagingFunction, (action: Action): void => {
        if(action) { 
            actionQueue.push(action);
            Promise.resolve().then(() => { 
                if(actionQueue.length > 0) {
                    const nextActions = [...actionQueue];
                    actionQueue = [];
                    const scenarioContext = updateLoop(nextActions);
                    if(updateCb !== undefined) updateCb(scenarioContext);
                }
            }).catch(e => false);
        }
    });
    const initialScenarioContext = updateLoop();
    if(updateCb !== undefined && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return [initialScenarioContext, dispatch];
}