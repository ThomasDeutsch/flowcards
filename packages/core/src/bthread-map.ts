import { BThread, BThreadId } from './bthread';


export class BThreadMap extends Map<BThreadId, BThread> {
    private _map: Map<string, BThread> = new Map();

    public static toIdString(bThreadId: BThreadId): string { 
        return bThreadId.key !== undefined ? `${bThreadId.name}__${bThreadId.key}` : bThreadId.name
    }

    public static toThreadId(idString: string): BThreadId { 
        const [id, key] = idString.split('__');
        return {name: id, key: key};
    }

    public get(bThreadId: BThreadId): BThread | undefined{
        return this._map.get(BThreadMap.toIdString(bThreadId));
    }

    public set(bThreadId: BThreadId, bThread: BThread): this {
        this._map.set(BThreadMap.toIdString(bThreadId), bThread);
        return this;
    }

    public has(bThreadId: BThreadId): boolean {
        return this._map.has(BThreadMap.toIdString(bThreadId));
    }

    public delete(bThreadId: BThreadId): boolean {
        return this._map.delete(BThreadMap.toIdString(bThreadId));
    }
}