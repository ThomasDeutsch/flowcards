export class BufferedQueue<T> {
    public readonly bufferSize: number;
    private _queue: T[] = [];

    constructor(bufferSize = 500) {
        this.bufferSize = bufferSize;
    }

    public add(value: T): void {
        if(this._queue.length === this.bufferSize) {
            throw new Error('BufferedQueue size limit reached');
        }
        this._queue.push(value);
    }

    public get get(): T | undefined {
        return this._queue.shift();
    }

    public get size(): number {
        return this._queue.length;
    }

    public clear(): void {
        this._queue = [];
    }
}