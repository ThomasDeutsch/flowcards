
import { BThreadGenerator, BThreadState, BThreadUtils } from './bthread';
import { NameKeyId, toNameKeyId } from './name-key-map';

export interface EnableScenarioInfo<P> {
    id: NameKeyId;
    destroyOnDisable: boolean;
    generatorFunction: BThreadGeneratorFunction<P>;
    nextProps?: P;
    updateStateCb: (state: BThreadState) => void;
}

export type BThreadGeneratorFunction<P extends Record<string, any> | void> = (this: BThreadUtils, props: P) => BThreadGenerator;

export class Scenario<P = void> {
    public readonly id: NameKeyId;
    private _generatorFunction: BThreadGeneratorFunction<P>;
    private _currentProps?: P;
    public readonly destroyOnDisable: boolean;
    private _bThreadState?: BThreadState;

    constructor(id: NameKeyId | string, generatorFn: BThreadGeneratorFunction<P>, destroyOnDisable?: boolean) {
        this.id = toNameKeyId(id);
        this._generatorFunction = generatorFn;
        this.destroyOnDisable = !!destroyOnDisable;
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


// export class ScenariosByKey<V, K extends EventKey, T extends BThreadGeneratorFunction<V>> {
//     public readonly id: string;
//     private _generatorFunction: T;
//     private _scenarioByKey = new Map<K, Scenario<T>>()

//     constructor(id: string, generatorFn: T) {
//         this.id = id;
//         this._generatorFunction = generatorFn;
//     }

//     public context(key: K, props?: Parameters<T>[1]): EnableScenarioInfo<V> {
//         let scenario = this._scenarioByKey.get(key);
//         if(scenario === undefined) {
//             scenario = new Scenario({name: this.id, key: key }, this._generatorFunction);
//             this._scenarioByKey.set(key, scenario);
//         }
//         return scenario.context(props)
//     }
// }
