
import { BThreadContext, BThreadGenerator, BThreadPublicContext } from './bthread';
import { NameKeyId } from './name-key-map';

export interface EnableScenarioInfo<P> {
    id: NameKeyId;
    destroyOnDisable: boolean;
    generatorFunction: BThreadGeneratorFunction<P>;
    nextProps?: P;
}
export interface ScenarioInfo {
    name: string;
    key?: string | number;
    destroyOnDisable?: boolean;
    description?: string;
}

export type BThreadGeneratorFunction<P extends Record<string, any> | void> = (this: BThreadContext, props: P) => BThreadGenerator;


function toInfoObj(info: ScenarioInfo | string): ScenarioInfo {
    if(typeof info === 'string') {
        return {
            name: info,
            destroyOnDisable: false,
            description: "",
            key: undefined
        }
    }
    else {
        return {
            name: info.name,
            key: info.key,
            description: info.description || "",
            destroyOnDisable: !!info.destroyOnDisable
        }
    }
}
export class Scenario<P = void> {
    public readonly id: NameKeyId;
    private _generatorFunction: BThreadGeneratorFunction<P>;
    private _currentProps?: P;
    public readonly destroyOnDisable: boolean;
    private _bThreadContext?: BThreadPublicContext;
    public readonly description?: string;

    constructor(info: ScenarioInfo | string, generatorFn: BThreadGeneratorFunction<P>) {
        this._generatorFunction = generatorFn;
        const i = toInfoObj(info);
        this.id = {name: i.name, key: i.key}
        this.destroyOnDisable = i.destroyOnDisable || false;
        this.description = i.description;
    }

    public __updateCurrentProps(p: P | undefined): void {
        this._currentProps = p;
    }

    public __updateBThreadContext(nextContext: BThreadPublicContext): void {
        this._bThreadContext = nextContext;
    }

    public get generatorFunction(): BThreadGeneratorFunction<P> {
        return this._generatorFunction;
    }

    public get currentProps(): P | undefined {
        return this._currentProps;
    }

    public get isCompleted(): boolean {
        return !!this._bThreadContext?.isCompleted;
    }
}


export class ScenarioKeyed<P = void> {
    private _generatorFunction: BThreadGeneratorFunction<P>;
    private _info: ScenarioInfo;
    private _children = new Map<string | number, Scenario<P>>()

    constructor(info: ScenarioInfo | string, generatorFn: BThreadGeneratorFunction<P>) {
        this._info = toInfoObj(info);
        this._generatorFunction = generatorFn;
    }

    public key(key: string | number): Scenario<P> {
        let scenario = this._children.get(key);
        if(scenario === undefined) {
            const infoWithKey: ScenarioInfo = {...this._info, key: key};
            scenario = new Scenario<P>(infoWithKey, this._generatorFunction);
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
