
import { FlowCore, FlowUtilities } from '.';
import { FlowGenerator } from './flow-core';
import { NameKeyId } from './name-key-map';


export interface FlowInfo {
    name: string;
    key?: string | number;
    destroyOnDisable?: boolean;
    description?: string;
}

export type FlowGeneratorFunction<P extends Record<string, any> | void> = (this: FlowUtilities, props: P) => FlowGenerator;


function toInfoObj(info: FlowInfo | string): FlowInfo {
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

export interface FlowState {
    isCompleted: boolean;
}


export class Flow<P = void> {
    public readonly id: NameKeyId;
    private _generatorFunction: FlowGeneratorFunction<P>;
    public readonly destroyOnDisable: boolean;
    public readonly description?: string;
    private _flowCore?: FlowCore<P>

    constructor(info: FlowInfo | string, generatorFn: FlowGeneratorFunction<P>) {
        this._generatorFunction = generatorFn;
        const i = toInfoObj(info);
        this.id = {name: i.name, key: i.key}
        this.destroyOnDisable = i.destroyOnDisable || false;
        this.description = i.description;
    }

    public get generatorFunction(): FlowGeneratorFunction<P> {
        return this._generatorFunction;
    }

    /** @internal */
    public __setCore(flowCore: FlowCore<P>): void {
        this._flowCore = flowCore;
    }

    public get isCompleted(): boolean | undefined {
        return this._flowCore?.isCompleted;
    }

    public get isConnected(): boolean {
        return this._flowCore !== undefined;
    }
}


export class FlowKeyed<P = void> {
    private _generatorFunction: FlowGeneratorFunction<P>;
    private _info: FlowInfo;
    private _children = new Map<string | number, Flow<P>>()

    constructor(info: FlowInfo | string, generatorFn: FlowGeneratorFunction<P>) {
        this._info = toInfoObj(info);
        this._generatorFunction = generatorFn;
    }

    public key(key: string | number): Flow<P> {
        let flow = this._children.get(key);
        if(flow === undefined) {
            const infoWithKey: FlowInfo = {...this._info, key: key};
            flow = new Flow<P>(infoWithKey, this._generatorFunction);
            this._children.set(key, flow);
        }
        return flow;
    }

    public keys(...keys: (string | number)[]): Flow<P>[] {
        return keys.map(key => this.key(key));
    }

    public allKeys(): (string | number)[] {
        return [...this._children].map(([k]) => k);
    }
}
