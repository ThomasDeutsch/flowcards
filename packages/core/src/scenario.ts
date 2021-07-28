
import { BThreadGenerator, BThreadState, BThreadUtils } from './bthread';
import { NameKeyId, toNameKeyId } from './name-key-map';
import * as utils from './utils';

export interface EnableScenarioInfo<P> {
    id: NameKeyId;
    destroyOnDisable: boolean;
    generatorFunction: BThreadGeneratorFunction<P>;
    nextProps?: P;
    updateStateCb: (state: BThreadState) => void;
}
export interface ScenarioProps {
    id: string;
    destroyOnDisable?: boolean;
    description?: string;
}

export type BThreadGeneratorFunction<P extends Record<string, any> | void> = (this: BThreadUtils, props: P) => BThreadGenerator;

export class Scenario<P = void> {
    public readonly id: NameKeyId;
    private _generatorFunction: BThreadGeneratorFunction<P>;
    private _currentProps?: P;
    public readonly destroyOnDisable: boolean;
    private _bThreadState?: BThreadState;
    public readonly description?: string;

    constructor(props: ScenarioProps | string | null, generatorFn: BThreadGeneratorFunction<P>) {
        this._generatorFunction = generatorFn;
        if(typeof props === 'string') {
            this.id = toNameKeyId(props);
            this.destroyOnDisable = false;
        } else if(props === null) {
            this.id = toNameKeyId(utils.uuidv4());
            this.destroyOnDisable = false;
        }
        else {
            this.id = toNameKeyId(props.id);
            this.description = props.description;
            this.destroyOnDisable = !!props.destroyOnDisable;
        }
    }

    public __updateCurrentProps(p: P | undefined): void {
        this._currentProps = p;
    }

    public __updateState(bThreadState: BThreadState): void {
        this._bThreadState = bThreadState;
    }

    public get generatorFunction(): BThreadGeneratorFunction<P> {
        return this._generatorFunction;
    }

    public get currentProps(): P | undefined {
        return this._currentProps;
    }

    public get isEnabled(): boolean {
        return !!this._bThreadState?.isEnabled;
    }

    public get section(): string {
        return this._bThreadState?.section || "";
    }

    public get isCompleted(): boolean {
        return !!this._bThreadState?.isCompleted;
    }

}


export class ScenarioKeyed<P> {
    private _generatorFunction: BThreadGeneratorFunction<P>;
    private _props: ScenarioProps | string | null;
    private _children = new Map<string | number, Scenario<P>>()

    constructor(props: ScenarioProps | string | null, generatorFn: BThreadGeneratorFunction<P>) {
        this._props = props;
        this._generatorFunction = generatorFn;
    }

    public key(key: string | number): Scenario<P> {
        let scenario = this._children.get(key);
        if(scenario === undefined) {
            scenario = new Scenario<P>(this._props, this._generatorFunction);
            this._children.set(key, scenario);
        }
        return scenario;
    }

    public keys(...keys: (string | number)[]): Scenario<P>[] {
        return keys.map(key => this.key(key));
    }

    public allKeys(): (string | number)[] {
        return [...this._children].map(([k]) => k);
    }

}
