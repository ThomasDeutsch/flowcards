export class ExtendContext {
    private _promise?: Promise<unknown>;
    public get promise(): Promise<unknown> | undefined { return this._promise }
    private _resolveFn?: (value?: unknown) => void;

    constructor() {
        this._promise = new Promise((resolve) => {
            this._resolveFn = resolve;
        });
    }

    public resolve(value?: unknown): void {
        delete this._promise;
        this._resolveFn?.(value);
    }
}
