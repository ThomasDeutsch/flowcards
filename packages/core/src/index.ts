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

export type UpdateCallback = (newContext: ScenariosContext) => void;
export type SingleActionDispatch = (action: Action) => void;
export type DispatchCommand = (command: Replay | ContextChange | PlayPause) => void;
export type ContextTest = (context: ScenariosContext) => any;

export interface ActionWithId extends Action {
    id: number;
}

export interface Replay {
    type: 'replay';
    actions: ActionWithId[];
    breakpoints?: Set<number>;
    tests?: Map<number, ContextTest[]>;
}

export interface ContextChange {
    type: 'contextChange';
}

export interface PlayPause {
    type: 'playPause';
}

export class Scenarios {
    private _bufferedActions: Action[] = [];
    private _latestReplay?: Replay;
    private _updateLoop: UpdateLoop;
    private _updateCb?: UpdateCallback;
    public initialScenariosContext: ScenariosContext;

    private _singleActionDispatch(action: Action) {
        if(this._updateLoop.isPaused && action.type === ActionType.ui) { // dispatching a ui action will resume a paused update-loop
            this._updateLoop.isPaused = false;
            this._bufferedActions.unshift(action);
        } else {
            this._bufferedActions.push(action);
        }
        this._clearBufferOnNextTick();
    }

    constructor(stagingFunction: StagingFunction, updateCb?: UpdateCallback, doInitialUpdate = false) {
        this._updateLoop = new UpdateLoop(stagingFunction, this._singleActionDispatch.bind(this));
        this.initialScenariosContext = this._updateLoop.runScaffolding();
        this._updateCb = updateCb;
        if(updateCb && doInitialUpdate) updateCb(this.initialScenariosContext); // callback with initial value
    }

    private _maybeCallUpdateCb(context: ScenariosContext) {
        if(this._updateCb) this._updateCb(context); // call update callback!
    }

    private _clearBufferOnNextTick = () => {
        Promise.resolve().then(() => { // next tick
            if(this._latestReplay) {
                const actionCopy = {...this._latestReplay};
                delete this._latestReplay;
                this._maybeCallUpdateCb(this._updateLoop.startReplay(actionCopy));
            }
            if(this._bufferedActions.length > 0) {
                this._updateLoop.setUiActionQueue(this._bufferedActions);
                this._bufferedActions.length = 0;
                this._maybeCallUpdateCb(this._updateLoop.runScaffolding())
            } 
        }).catch(error => console.error(error));
    }

    private _dispatch(command: Replay | ContextChange | PlayPause): void {
        switch(command.type) {
            case 'contextChange': {
                this._maybeCallUpdateCb(this._updateLoop.runScaffolding());
                break;
            }
            case 'playPause': {
                this._maybeCallUpdateCb(this._updateLoop.togglePaused());
                break;
            }
            case 'replay': {
                if(command.actions === undefined || command.actions.length === 0) {
                    console.warn('replay was dispatched without replay actions - replay was aborted');
                    return;
                }
                this._bufferedActions.length = 0; // cancel all buffered actions
                this._latestReplay = {...command};
                this._clearBufferOnNextTick();
            }
        }
    }
    
    public get dispatch(): DispatchCommand { return this._dispatch.bind(this) }
}