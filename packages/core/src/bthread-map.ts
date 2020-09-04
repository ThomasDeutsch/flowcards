import { BThreadId } from './bthread';


export class BThreadMap<T> extends Map<BThreadId, T> {
    private _map: Map<string, T> = new Map();

    public static toIdString(bThreadId: BThreadId): string { 
        return bThreadId.key !== undefined ? `${bThreadId.name}__${bThreadId.key}` : bThreadId.name
    }

    public static toThreadId(idString: string): BThreadId { 
        const [id, key] = idString.split('__');
        return {name: id, key: key};
    }

    public get(bThreadId: BThreadId | string): T | undefined{
        if(typeof bThreadId === 'string') {
            return this._map.get(BThreadMap.toIdString(BThreadMap.toThreadId(bThreadId)));
        }
        return this._map.get(BThreadMap.toIdString(bThreadId));
    }

    public set(bThreadId: BThreadId, val: T): this {
        this._map.set(BThreadMap.toIdString(bThreadId), val);
        return this;
    }

    public has(bThreadId: BThreadId): boolean {
        return this._map.has(BThreadMap.toIdString(bThreadId));
    }

    public delete(bThreadId: BThreadId): boolean {
        return this._map.delete(BThreadMap.toIdString(bThreadId));
    }
}