import { Action } from './action';
import { ScenariosContext, UpdateLoop } from './update-loop';
import { StagingFunction } from './scaffolding';

export * from './scenario';
export * from './bthread';
export * from './update-loop';
export * from './event-cache';
export * from './event-context';
export * from './event-map';
export * from "./bid";
export * from "./scaffolding";
export * from './event-map';
export * from './logger';
export * from './action';
export * from './extend-context';
export const CONTEXT_CHANGED: unique symbol = Symbol('contextChanged');

export type UpdateCallback = (scenario: ScenariosContext) => any;
export type DispatchActions = (actions: Action[] | typeof CONTEXT_CHANGED) => void;
export type PlayPause = { getIsPaused: () => boolean; toggle: () => void };

export function scenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback, updateInitial = false): [ScenariosContext, DispatchActions, PlayPause] {
    const bufferedActions: Action[] = [];
    let isPaused = false;
    const bufferedReplayMap = new Map<number, Action>();

    function placeBufferedAction(action?: Action): void {
        if(action === undefined) return;
        if(action.id === null) {
            bufferedActions.push(action);
        } else {  // is a replay action
            if(action.id === 0) {
                loop.replayMap.clear();
            }
            bufferedReplayMap.set(action.id, action);
        }
    }

    function internalDispatchSingleAction(action: Action): void {
        placeBufferedAction(action);
        clearBufferOnNextTick();
    }

    function dispatchMultipleActions(actions: Action[]): void {
        actions.forEach(action => placeBufferedAction(action));
        clearBufferOnNextTick();
    }

    const loop = new UpdateLoop(stagingFunction, internalDispatchSingleAction);

    const clearBufferOnNextTick = (forceRefresh?: boolean) => {
        Promise.resolve().then(() => { // next tick
            let withUpdate = false;
            if(bufferedReplayMap.size !== 0) {
                bufferedActions.length = 0;
                bufferedReplayMap.forEach((action, key) => loop.replayMap.set(key, action)); // transfer buffer to replay-Map
                bufferedReplayMap.clear();
                withUpdate = true;
            }
            else if(bufferedActions.length !== 0 && !isPaused) {
                bufferedActions.forEach(action => loop.actionQueue.push(action)); // transfer buffer to action-queue
                bufferedActions.length = 0;
                withUpdate = true;
            } 
            if(withUpdate || forceRefresh) {
                if(updateCb !== undefined) updateCb(loop.setupContext(isPaused)); // call update callback!
                else loop.setupContext(isPaused);
            }
        });
    }

    const togglePlayPause = () => { 
        isPaused = !isPaused;
        clearBufferOnNextTick(true);
     };

    const dispatchActions = (actions: Action[] | typeof CONTEXT_CHANGED) => {
        if(actions === CONTEXT_CHANGED) { // an action, that will run on context change.
            loop.runScaffolding();
            loop.setupContext(isPaused);
        }
        else {
            dispatchMultipleActions(actions);
        }
    }

    const initialScenarioContext = loop.setupContext(isPaused);
    if(updateCb !== undefined && updateInitial) updateCb(initialScenarioContext); // callback with initial value
    return [initialScenarioContext, dispatchActions, { getIsPaused: () => isPaused, toggle: togglePlayPause }];
}