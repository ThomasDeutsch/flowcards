
export class ExtendContext {
    private _isCompleted = false;
    public get isCompleted() { return this._isCompleted }
    private _value: any;
    public get value() { return this._value }
    private _promise?: Promise<unknown>;
    public get promise() { return this._promise }
    private _resolveFn?: (value?: unknown) => void;
    private _rejectFn?: (reason?: any) => void;

    constructor(payload: any) {
        this._value = payload;
        this._promise = new Promise((resolve, reject) => {
            this._resolveFn = resolve;
            this._rejectFn = reject;
        });
    }

    public resolve(value?: unknown) { 
        delete this._promise;
        this._isCompleted = true; 
        this._resolveFn?.(value);
        this._value = value;
    }

    public reject(reason: any) { 
        delete this._promise;
        this._isCompleted = true; 
        this._rejectFn?.(reason)
    }
}