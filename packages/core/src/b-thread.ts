
import { BThreadContext, BThreadGenerator, BThreadPublicContext } from './bthread-core';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { PendingBid } from './pending-bid';


export interface BThreadInfo {
    name: string;
    key?: string | number;
    destroyOnDisable?: boolean;
    description?: string;
}

export type BThreadGeneratorFunction<P extends Record<string, any> | void> = (this: BThreadContext, props: P) => BThreadGenerator;


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


export class BThread<P = void> {
    public readonly id: NameKeyId;
    private _generatorFunction: BThreadGeneratorFunction<P>;
    public readonly destroyOnDisable: boolean;
    private _bThreadContext?: BThreadPublicContext;
    public readonly description?: string;

    constructor(info: BThreadInfo | string, generatorFn: BThreadGeneratorFunction<P>) {
        this._generatorFunction = generatorFn;
        const i = toInfoObj(info);
        this.id = {name: i.name, key: i.key}
        this.destroyOnDisable = i.destroyOnDisable || false;
        this.description = i.description;
    }

    /** @internal */
    public __updateBThreadContext(nextContext: BThreadPublicContext): void {
        this._bThreadContext = nextContext;
    }

    public get generatorFunction(): BThreadGeneratorFunction<P> {
        return this._generatorFunction;
    }

    public get isCompleted(): boolean {
        return !!this._bThreadContext?.isCompleted;
    }

    public get pendingRequests(): NameKeyMap<PendingBid> | undefined {
        return this._bThreadContext?.pendingRequests;
    }

    public get pendingExtends(): NameKeyMap<PendingBid> | undefined {
        return this._bThreadContext?.pendingExtends;
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
