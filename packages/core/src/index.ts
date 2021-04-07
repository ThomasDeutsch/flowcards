import { AnyActionWithId, ResolveAction, ResolveExtendAction, UIAction } from './action';
import { ScenariosContext, UpdateLoop } from './update-loop';
import { StagingFunction } from './scaffolding';
import { Logger } from './logger';

export * from './scenario';
export * from './bthread';
export * from './update-loop';
export * from './event-cache';
export * from './event-map';
export * from "./bid";
export * from "./scaffolding";
export * from './event-map';
export * from './logger';
export * from './action';
export * from './extend-context';

export type UpdateCallback = (newContext: ScenariosContext) => void;
export type InternalDispatch = (action: UIAction | ResolveAction | ResolveExtendAction) => void;
export type DispatchCommand = (command: Replay | ContextChange) => void;
export type ContextTest = (context: ScenariosContext) => any;

export interface Replay {
    type: 'replay';
    actions: AnyActionWithId[];
    breakpoints?: Set<number>;
    tests?: Map<number, ContextTest[]>;
}

export interface ContextChange {
    type: 'appContextChange';
}


export class Scenarios {
    private _bufferedActions: (UIAction | ResolveAction | ResolveExtendAction)[] = [];
    private _latestReplay?: Replay;
    private _updateLoop: UpdateLoop;
    private _updateCb?: UpdateCallback;
    public initialScenariosContext: ScenariosContext;
    private _logger: Logger;

    constructor(stagingFunction: StagingFunction, updateCb?: UpdateCallback, doInitialUpdate = false) {
        this._logger = new Logger();
        this._updateLoop = new UpdateLoop(stagingFunction, this._internalDispatch.bind(this), this._logger);
        this.initialScenariosContext = this._updateLoop.runScaffolding();
        this._updateCb = updateCb;
        if(updateCb && doInitialUpdate) updateCb(this.initialScenariosContext); // callback with initial value
    }

    private _internalDispatch(action: UIAction | ResolveAction | ResolveExtendAction) {
        this._bufferedActions.push(action);
        this._clearBufferOnNextTick();
    }

    private _maybeCallUpdateCb(context: ScenariosContext) {
        if(this._updateCb) this._updateCb(context); // call update callback!
    }

    private _clearBufferOnNextTick = () => {
        Promise.resolve().then(() => { // next tick
            if(this._latestReplay) {
                this._bufferedActions.length = 0;
                this._maybeCallUpdateCb(this._updateLoop.startReplay({...this._latestReplay}));
                delete this._latestReplay;
            }
            else if(this._bufferedActions.length > 0) {
                this._updateLoop.setActionQueue(this._bufferedActions);
                this._bufferedActions.length = 0;
                this._maybeCallUpdateCb(this._updateLoop.runScaffolding())
            } 
        });
    }

    private _dispatch(command: Replay | ContextChange): void {
        switch(command.type) {
            case 'appContextChange': {
                //TODO: make context change replayable
                // for this, the logger needs to be placed in this Scenarios Class
                // a method needs to be added to the logger
                // 
                this._maybeCallUpdateCb(this._updateLoop.runScaffolding());
                break;
            }
            case 'replay': {
                if(command.actions === undefined || command.actions.length === 0) {
                    console.warn('replay was dispatched without replay actions - replay was aborted');
                    return;
                }
                this._latestReplay = {...command};
                this._clearBufferOnNextTick();
            }
        }
    }
    
    public get dispatch(): DispatchCommand { return this._dispatch.bind(this) }
}