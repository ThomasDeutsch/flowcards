/**
 * a type that represents the id of an event or flow
 * @privateRemarks
 * even if the name is the same, a flow or event can have multiple instances, because of this, the second part (the key) is needed
 */
export type TupleId = [string, string | undefined];

/**
 * @internal
 * TupleId as a string
 */
export type TupleIdString = string | `${string}::${string}`;

/**
 * a wrapper for a JavasScript Map where the key is of type TupleId and the value is of type T
 * @internal
 * @typeParam T the type of the value in the map
 */
export class TupleMap<T> {
    private readonly _map: Map<TupleIdString, T>;

    constructor() {
        this._map = new Map<TupleIdString, T>();
    }

    /**
     * add an element to the map.
     * @param id the tuple id to add
     * @param value the value to add to the map
     * @internalRemarks mutates ._map, ._nrAddedElements
     */
    public set(id: TupleId, value: T): void {
        this._map.set(toTupleIdString(id), value);
    }

    /**
     * get the value of an element in the map
     * @param id the id of the element to get
     */
    public get(id: TupleId): T | undefined {
        return this._map.get(toTupleIdString(id));
    }

    /**
     * check if the map has a certain element
     * @param id the id to check
     * @returns true if the map has an element with the given id
     */
    public has(id: TupleId): boolean {
        return this._map.has(toTupleIdString(id));
    }

    /**
     * delete one element (by id) from the map
     * @param id the tuple id to remove
     * @returns true if the element was deleted from the map, false if the element was not in the map
     */
    public delete(id: TupleId): boolean {
        return this._map.delete(toTupleIdString(id));
    }

    /**
     * call the callback function for each element in the map. Will not mutate the map.
     * @param callbackFunction a function that takes a value and performs a side effect.
     */
    public forEach(callbackFunction: (value: T, id: TupleId, map: Map<TupleIdString, T>) => void): void {
        this._map.forEach((value, id) => {
            callbackFunction(value, toTupleId(id), this._map);
        });
    }

    /**
     * filter the map elements. Will not mutate the map.
     * @param filterCallbackFunction a function that takes a value and returns a boolean
     * @returns a new TupleMap with all elements that match the callbackfn
     */
    public filter(filterCallbackFunction: (value: T, id: TupleId, map: Map<TupleIdString, T>) => boolean): TupleMap<T> {
        const result = new TupleMap<T>();
        this._map.forEach((value, id) => {
            const tupleId = toTupleId(id)
            if(filterCallbackFunction(value, tupleId, this._map)) {
                result.set(tupleId, value);
            }
        });
        return result;
    }

    /**
     * return all values of the map
     * @returns an array of all values in the map
     */
    public values(): T[] {
        return Array.from(this._map.values());
    }

    /**
     * update a value of a map element. Will mutate the map
     * @param filterCallbackFunction a function that takes a value and returns a boolean
     * @returns a new TupleMap with all elements that match the callbackfn
     * @remarks: mutates: ._map
     */
    public update(id: TupleId, updateCallbackFunction: (currentValue?: T) => T): void {
        const currentValue = this.get(id);
        const nextValue = updateCallbackFunction(currentValue);
        this.set(id, nextValue);
    }

    /**
     * merge two maps. Will return a new map
     * @param otherMap the map that is merged into this map
     */
    public merge(otherMap?: TupleMap<T>): TupleMap<T> {
        const result = new TupleMap<T>();
        this.forEach((value, key) => {
            result.set(key, value);
        });
        otherMap?.forEach((value, key) => {
            result.set(key, value);
        });
        return result;
    }

    /**
     * clear the map. After this call, the map will be empty.
     */
    public clear(): void {
        this._map.clear();
    }
}



// HELPER FUNCTIONS ----------------------------------------------------------------------------------

/**
 * a function that converts a string to an TupleId
 * @param id: the id to convert to a tuple
 * @returns a tuple with the id and the key
 */
 export function toTupleId(id: TupleIdString): TupleId {
    const [name, instanceId] = id.split('::');
    return [name, instanceId];
}

/**
 * a function that takes an id tuple and returns a string
 * @param id: the id to convert to a string
 * @returns a string of the form "name:key"
 */
export function toTupleIdString(id: TupleId): TupleIdString {
    if(id[1] === undefined) {
        return `${id[0]}`;
    } else {
        return `${id[0]}::${id[1]}`;
    }
}

/**
 * function to check if two tuple ids are equal
 * @param id1 first tuple id
 * @param id2 second tuple id
 * @returns true if the tuple ids are equal
 */
export function isSameTupleId(id1: TupleId, id2: TupleId): boolean {
    return id1[0] === id2[0] && id1[1] === id2[1];
}