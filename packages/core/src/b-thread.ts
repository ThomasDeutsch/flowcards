
import { BThreadCore, BThreadUtilities } from '.';
import { BThreadGenerator } from './bthread-core';
import { NameKeyId } from './name-key-map';


export interface BThreadInfo {
    name: string;
    key?: string | number;
    destroyOnDisable?: boolean;
    description?: string;
}

export type BThreadGeneratorFunction<P extends Record<string, any> | void> = (this: BThreadUtilities, props: P) => BThreadGenerator;


function toInfoObj(info: BThreadInfo | string): BThreadInfo {
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

export interface BThreadState {
    isCompleted: boolean;
}


export class BThread<P = void> {
    public readonly id: NameKeyId;
    private _generatorFunction: BThreadGeneratorFunction<P>;
    public readonly destroyOnDisable: boolean;
    public readonly description?: string;
    private _bThreadCore?: BThreadCore<P>

    constructor(info: BThreadInfo | string, generatorFn: BThreadGeneratorFunction<P>) {
        this._generatorFunction = generatorFn;
        const i = toInfoObj(info);
        this.id = {name: i.name, key: i.key}
        this.destroyOnDisable = i.destroyOnDisable || false;
        this.description = i.description;
    }

    public get generatorFunction(): BThreadGeneratorFunction<P> {
        return this._generatorFunction;
    }

    /** @internal */
    public __setCore(bThreadCore: BThreadCore<P>): void {
        this._bThreadCore = bThreadCore;
    }

    public get isCompleted(): boolean | undefined {
        return this._bThreadCore?.isCompleted;
    }

    public get isConnected(): boolean {
        return this._bThreadCore !== undefined;
    }
}


export class BThreadKeyed<P = void> {
    private _generatorFunction: BThreadGeneratorFunction<P>;
    private _info: BThreadInfo;
    private _children = new Map<string | number, BThread<P>>()

    constructor(info: BThreadInfo | string, generatorFn: BThreadGeneratorFunction<P>) {
        this._info = toInfoObj(info);
        this._generatorFunction = generatorFn;
    }

    public key(key: string | number): BThread<P> {
        let bThread = this._children.get(key);
        if(bThread === undefined) {
            const infoWithKey: BThreadInfo = {...this._info, key: key};
            bThread = new BThread<P>(infoWithKey, this._generatorFunction);
            this._children.set(key, bThread);
        }
        return bThread;
    }

    public keys(...keys: (string | number)[]): BThread<P>[] {
        return keys.map(key => this.key(key));
    }

    public allKeys(): (string | number)[] {
        return [...this._children].map(([k]) => k);
    }
}
