import { Action, ActionType } from './action';
import { ScenariosContext, StagingFunction, UpdateLoop } from './update-loop';
import { ActionLog } from './action-log';

export * from './scenario';
export * from './bthread';
export * from './update-loop';
export * from './event-cache';
export * from './event-context';
export * from './event-map';
export * from "./bid";
export * from './event-map';
export * from './action-log';
export * from './action';
export * from './extend-context';
export type UpdateCallback = (scenario: ScenariosContext) => any;
export type DispatchActions = (actions: Action[] | null) => void;
export type PlayPause = { getIsPaused: () => boolean; toggle: () => void };

export function scenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback, updateInitial = false): [ScenariosContext, DispatchActions, PlayPause] {
    const bufferedActions: Action[] = [];
    const actionLog = new ActionLog();
    let isPaused = false;
    const bufferedReplayMap = new Map<number, Action>();
    const loop = new UpdateLoop(stagingFunction, 
        (action: Action): void => {
            if(action) {
                if(action.loopIndex === null) {
                    bufferedActions.push(action);
                } else {  // is a replay action
                    if(action.loopIndex === 0) loop.replayMap.clear();
                    bufferedReplayMap.set(action.loopIndex, action);
                    console.log('gogo replay: ', isPaused);
                }
                clearBufferOnNextTick();
            }
    }, actionLog);
    const clearBufferOnNextTick = (forceRefresh?: boolean) => {
        Promise.resolve().then(() => {
            let withUpdate = false;
            if(bufferedReplayMap.size !== 0) {
                bufferedActions.length = 0; // remove all buffered actions
                bufferedReplayMap.forEach((action, key) => loop.replayMap.set(key, action));
                bufferedReplayMap.clear();
                withUpdate = true;
            }
            else if(bufferedActions.length !== 0 && !isPaused) {
                bufferedActions.forEach(action => loop.actionQueue.push(action));
                bufferedActions.length = 0;
                withUpdate = true;
            } 
            if(withUpdate || forceRefresh) {
                if(updateCb !== undefined) updateCb(loop.setupContext(isPaused));
                else loop.setupContext(isPaused);
            }
        });
    }
    const togglePlayPause = () => { 
        isPaused = !isPaused;
        clearBufferOnNextTick(true);
     };
    const dispatchActions = (actions: Action[] | null) => {
        if(actions === null) loop.setupContext(isPaused);
        else {
            actions.forEach(action => loop.actionDispatch(action));
        }
    }
    const initialScenarioContext = loop.setupContext(isPaused);
    if(updateCb !== undefined && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return [initialScenarioContext, dispatchActions, { getIsPaused: () => isPaused, toggle: togglePlayPause }];
}
