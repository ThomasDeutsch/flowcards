import { StagingFunction, createUpdateLoop, ScenariosContext } from './update-loop';
import { Action } from './action'
import { EventDispatch } from './event-dispatcher';

export { EventDispatch } from './event-dispatcher';
export { BTContext, BThreadState, BTGen } from './bthread';
export { UpdateLoopFunction, StagingFunction, createUpdateLoop, ScenariosContext, Ref } from './update-loop';
export { wait, intercept, block, request, Bid } from "./bid";
export { FCEvent } from './event';
export { Log, ActionAndReactions, ThreadsByWait} from './logger';
export { Action } from './action';
export { Reaction } from './reaction';
export type UpdateCallback = (scenario: ScenariosContext) => any;

export function scenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback): [ScenariosContext, EventDispatch] {
    const actionQueue: Action[] = [];
    const [updateLoop, dispatch] = createUpdateLoop(stagingFunction, (action: Action): void => {
        if(action) {
            actionQueue.push(action);
            const scenarioContext = updateLoop(actionQueue);
            if(updateCb !== undefined) updateCb(scenarioContext);
        }
    });
    const initialScenarioContext = updateLoop();
    return [initialScenarioContext, dispatch];
}