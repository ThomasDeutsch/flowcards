
import { FlowCore, FlowGenerator, FlowUtilities } from './flow-core';
import { NameKeyId } from './name-key-map';


export interface FlowInfo {
    name: string;
    key?: string | number;
    keepProgressOnDisable?: boolean;
    description?: string;
}

export type FlowGeneratorFunction = (this: FlowUtilities) => FlowGenerator;


function toInfoObj(info: FlowInfo | string): FlowInfo {
    if(typeof info === 'string') {
        return {
            name: info,
            keepProgressOnDisable: false,
            description: "",
            key: undefined
        }
    }
    else {
        return {
            name: info.name,
            key: info.key,
            description: info.description || "",
            keepProgressOnDisable: !!info.keepProgressOnDisable
        }
    }
}

export interface FlowState {
    isCompleted: boolean;
}


export class Flow {
    public readonly id: NameKeyId;
    private _generatorFunction: FlowGeneratorFunction;
    public readonly keepProgressOnDisable: boolean;
    public readonly description?: string;
    private _flowCore?: FlowCore;

    constructor(info: FlowInfo | string, generatorFn: FlowGeneratorFunction) {
        this._generatorFunction = generatorFn;
        const i = toInfoObj(info);
        this.id = {name: i.name, key: i.key}
        this.keepProgressOnDisable = i.keepProgressOnDisable || false;
        this.description = i.description;
    }

    public get generatorFunction(): FlowGeneratorFunction {
        return this._generatorFunction;
    }

    /** @internal */
    public __setCore(flowCore: FlowCore): void {
        this._flowCore = flowCore;
    }

    public get isCompleted(): boolean | undefined {
        return this._flowCore?.isCompleted;
    }

    public get isConnected(): boolean {
        return this._flowCore !== undefined;
    }
}


export class FlowKeyed {
    private _generatorFunction: FlowGeneratorFunction;
    private _info: FlowInfo;
    private _children = new Map<string | number, Flow>()

    constructor(info: FlowInfo | string, generatorFn: FlowGeneratorFunction) {
        this._info = toInfoObj(info);
        this._generatorFunction = generatorFn;
    }

    public key(key: string | number): Flow {
        let flow = this._children.get(key);
        if(flow === undefined) {
            const infoWithKey: FlowInfo = {...this._info, key: key};
            flow = new Flow(infoWithKey, this._generatorFunction);
            this._children.set(key, flow);
        }
        return flow;
    }

    public keys(...keys: (string | number)[]): Flow[] {
        return keys.map(key => this.key(key));
    }

    public allKeys(): (string | number)[] {
        return [...this._children].map(([k]) => k);
    }
}
