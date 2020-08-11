import { Action, ActionType } from './action';
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
type StartReplay = (actions: Action[]) => void;

export function scenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback, updateInitial = false): [ScenariosContext, EventDispatch, StartReplay] {
    const [updateLoop, dispatch, actionQueue, replayMap, actionDispatch] = createUpdateLoop(stagingFunction, (action: Action): void => {
        if(action) {
            if(action.index !== null) { // is a replay action
                if(action.index === 0) replayMap.clear();
                replayMap.set(action.index, action);
            } else {
                actionQueue.push(action);
            }
            Promise.resolve().then(() => {
                if(updateCb !== undefined) updateCb(updateLoop());
                else updateLoop();
            }).catch(e => false);
        }
    });
    const startReplay = (actions: Action[]) => {
       actions.forEach(action => actionDispatch(action));
    }
    const initialScenarioContext = updateLoop();
    if(updateCb !== undefined && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return [initialScenarioContext, dispatch, startReplay];
}
