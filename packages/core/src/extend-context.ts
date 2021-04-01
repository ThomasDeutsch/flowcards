export class ExtendContext {
    private _isCompleted = false;
    public get isCompleted(): boolean { return this._isCompleted }
    private _value: any;
    public get value(): any { return this._value }
    private _promise?: Promise<unknown>;
    public get promise(): Promise<unknown> | undefined { return this._promise }
    private _resolveFn?: (value?: unknown) => void;

    constructor(payload: unknown) {
        this._value = payload;
    }

    public resolve(value?: unknown): void { 
        delete this._promise;
        this._isCompleted = true; 
        this._resolveFn?.(value);
        this._value = value;
    }

    public createPromiseIfNotCompleted(): void {
        if(this.isCompleted) return;
        this._promise = new Promise((resolve) => {
            this._resolveFn = resolve;
        });
    }
}