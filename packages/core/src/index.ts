import { Action } from './action';
import { ScenariosContext, UpdateLoop } from './update-loop';
import { StagingFunction, ActionDispatch } from './scaffolding';

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

export class Scenarios {
    private _bufferedActions: Action[] = [];
    private _isPaused = false;
    public get isPaused(): boolean { return this._isPaused }
    private _bufferedReplayMap = new Map<number, Action>();
    private _loop: UpdateLoop;
    private _updateCb?: UpdateCallback;
    public initialScenariosContext: ScenariosContext;

    constructor(stagingFunction: StagingFunction, updateCb?: UpdateCallback, updateInitial = false) {
        this._loop = new UpdateLoop(stagingFunction, this._dispatchSingleAction.bind(this));
        this.initialScenariosContext = this._loop.setupContext(this._isPaused);
        this._updateCb = updateCb;
        if(this._updateCb !== undefined && updateInitial) this._updateCb(this.initialScenariosContext); // callback with initial value
    }

    private _placeBufferedAction(action?: Action): void {
        if(action === undefined) return;
        if(action.id === null) {
            this._bufferedActions.push(action);
        } else {  // is a replay action
            if(action.id === 0) {
                this._loop.replayMap.clear();
            }
            this._bufferedReplayMap.set(action.id, action);
        }
    }

    private _clearBufferOnNextTick = (forceRefresh?: boolean) => {
        Promise.resolve().then(() => { // next tick
            let withUpdate = false;
            if(this._bufferedReplayMap.size !== 0) {
                this._bufferedActions.length = 0;
                this._bufferedReplayMap.forEach((action, key) => this._loop.replayMap.set(key, action)); // transfer buffer to replay-Map
                this._bufferedReplayMap.clear();
                withUpdate = true;
            }
            else if(this._bufferedActions.length !== 0 && !this._isPaused) {
                this._bufferedActions.forEach(action => this._loop.actionQueue.push(action)); // transfer buffer to action-queue
                this._bufferedActions.length = 0;
                withUpdate = true;
            } 
            if(withUpdate || forceRefresh) {
                if(this._updateCb !== undefined) this._updateCb(this._loop.setupContext(this._isPaused)); // call update callback!
                else this._loop.setupContext(this._isPaused);
            }
        });
    }

    private _dispatchSingleAction(action: Action): void {
        this._placeBufferedAction(action);
        this._clearBufferOnNextTick();
    }

    private _dispatchMultipleActions(actions: Action[]): void {
        actions.forEach(action => this._placeBufferedAction(action));
        this._clearBufferOnNextTick();
        
    }

    private _dispatchActions(actions: Action[] | typeof CONTEXT_CHANGED): void {
        if(actions === CONTEXT_CHANGED) { // an action, that will run on context change.
            this._loop.runScaffolding();
            this._loop.setupContext(this._isPaused);
        }
        else {
            this._dispatchMultipleActions(actions);
        }
    }
    
    public get dispatchActions(): DispatchActions { return this._dispatchActions.bind(this) }
}