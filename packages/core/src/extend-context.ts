import { PlacedBid } from ".";

export class ExtendContext {
    private _isCompleted = false;
    public readonly bid: PlacedBid;
    public get isCompleted(): boolean { return this._isCompleted }
    private _value: any;
    public get value(): any { return this._value }
    private _promise?: Promise<unknown>;
    public get promise(): Promise<unknown> | undefined { return this._promise }
    private _resolveFn?: (value?: unknown) => void;

    constructor(payload: unknown, bid: PlacedBid) {
        this._value = payload;
        this.bid = bid;
    }

    public resolve(value?: unknown): void { 
        delete this._promise;
        this._isCompleted = true; 
        this._resolveFn?.(value);
        this._value = value;
    }

    public createPromiseIfNotCompleted(): void {
        if(this.isCompleted) return;
        this._promise = new Promise((resolve, reject) => {
            this._resolveFn = resolve;
        });
    }
}