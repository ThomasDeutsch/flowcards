import { Action, ActionType } from './action';
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

export type UpdateCallback = (scenario: ScenariosContext) => any;
export type SingleActionDispatch = (action: Action) => void;
export type ScenariosDispatch = (action: ScenariosAction) => void;
export interface ScenariosContextTest {
    testFunctionId: string;
}

export interface ActionWithId extends Action {
    id: number;
}

export interface ScenariosAction {
    type: 'replay' | 'playPause' | 'contextChange';
    items?: ActionWithId[];
}

export class Scenarios {
    private _bufferedActions: Action[] = [];
    private _bufferedReplayMap = new Map<number, Action>();
    private _updateLoop: UpdateLoop;
    private _updateCb?: UpdateCallback;
    public initialScenariosContext: ScenariosContext;

    private _singleActionDispatch(action: Action) {
        if(action.type === ActionType.ui) { // dispatching a ui action will resume a paused update-loop
            this._updateLoop.isPaused = false;
        }
        this._bufferedActions.push(action);
        this._clearBufferOnNextTick();
    }

    constructor(stagingFunction: StagingFunction, updateCb?: UpdateCallback, updateInitial = false) {
        this._updateLoop = new UpdateLoop(stagingFunction, this._singleActionDispatch.bind(this));
        this.initialScenariosContext = this._updateLoop.setupContext();
        this._updateCb = updateCb;
        if(this._updateCb !== undefined && updateInitial) this._updateCb(this.initialScenariosContext); // callback with initial value
    }

    private _clearBufferOnNextTick = () => {
        Promise.resolve().then(() => { // next tick
            if(this._bufferedReplayMap.size > 0) {
                this._updateLoop.replayMap.clear();
                this._bufferedReplayMap.forEach((actionOrTest, key) => this._updateLoop.replayMap.set(key, actionOrTest)); // transfer buffer to replay-Map
                this._bufferedReplayMap.clear();
                if(this._updateCb) this._updateCb(this._updateLoop.startReplay());
                else this._updateLoop.startReplay();
            }
            if(this._bufferedActions.length > 0) {
                this._bufferedActions.forEach(action => this._updateLoop.actionQueue.push(action)); // transfer buffer to action-queue
                this._bufferedActions.length = 0;
                if(this._updateCb) this._updateCb(this._updateLoop.setupContext()); // call update callback!
                else this._updateLoop.setupContext();
            } 
        }).catch(error => console.error(error));
    }

    private _dispatch(scenariosAction: ScenariosAction): void {
        switch(scenariosAction.type) {
            case 'contextChange': {
                this._updateLoop.runScaffolding();
                this._updateLoop.setupContext();
                break;
            }
            case 'playPause': {
                this._updateLoop.isPaused = !this._updateLoop.isPaused;
                this._updateLoop.setupContext();
                break;
            }
            case 'replay': {
                this._bufferedActions.length = 0; // cancel all buffered actions
                this._updateLoop.actionQueue.length = 0; // cancel all queued actions
                scenariosAction.items?.forEach(action => this._bufferedReplayMap.set(action.id, action));
                this._clearBufferOnNextTick();
            }
        }
    }
    
    public get dispatch(): ScenariosDispatch { return this._dispatch.bind(this) }
}