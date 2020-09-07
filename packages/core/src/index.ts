import { Action } from './action';
import { ScenariosContext, StagingFunction, UpdateLoop } from './update-loop';

export * from './scenario';
export * from './bthread';
export * from './update-loop';
export * from './event-cache';
export * from "./bid";
export * from './event-map';
export * from './action-log';
export * from './action';
export * from './event-context';
export * from './extend-context';
export type UpdateCallback = (scenario: ScenariosContext) => any;
export type StartReplay = (actions: Action[]) => void;

export function scenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback, updateInitial = false): [ScenariosContext, StartReplay] {
    const bufferedActions: Action[] = [];
    const bufferedReplayMap = new Map<number, Action>();
    const loop = new UpdateLoop(stagingFunction, 
        (action: Action): void => {
            if(action) {
                if(action.loopIndex === null) {
                    bufferedActions.push(action);
                } else {  // is a replay action
                    if(action.loopIndex === 0) loop.replayMap.clear();
                    bufferedReplayMap.set(action.loopIndex, action);
                }
                Promise.resolve().then(() => {
                    let withUpdate = false;
                    if(bufferedActions.length !== 0) {
                        bufferedActions.forEach(action => loop.actionQueue.push(action));
                        bufferedActions.length = 0;
                        withUpdate = true;
                    } if(bufferedReplayMap.size !== 0) {
                        bufferedReplayMap.forEach((action, key) => loop.replayMap.set(key, action));
                        bufferedReplayMap.clear();
                        withUpdate = true;
                    }
                    if(withUpdate) {
                        if(updateCb !== undefined) updateCb(loop.setupContext());
                        else loop.setupContext();
                    }
                });
            }
    });
    const startReplay = (actions: Action[]) => {
       actions.forEach(action => loop.actionDispatch(action));
    }
    const initialScenarioContext = loop.setupContext();
    if(updateCb !== undefined && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return [initialScenarioContext, startReplay];
}
