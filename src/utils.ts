import { AccumulatedValidationResults } from "./action-explain";
import { Event, EventByKey } from "./event";

/**
 * @internal
 * check if a value is thenable (possibly a promise)
 * @param p a possible candidate for a promise
 * @returns true if p is thenable
 * @internalRemarks promise duck-typing:  https://www.bookstack.cn/read/AsyncPerformance/spilt.2.ch3.md
 */
export function isThenable(p?: unknown): p is Promise<unknown> {
    return p !== undefined && p !==  null && typeof p === 'object' && typeof (p as PromiseLike<unknown>).then === 'function';
}

/**
 * @internal
 * assert that a value is not null or undefined.
 * Best used in a filter function, to filter out null or undefined values and tell TypeScript that
 * the value is guaranteed to be of type T
 * @param value the value to check
 * @returns true if the value is not null or undefined
 */
 export function isDefined<T>(value: T | null | undefined): value is T {
    return (value !== null && value !== undefined);
  }

/**
 * @internal
 * append an item to the end of a possible undefined array
 * @param coll an array of a Generic Type or undefined
 * @param item the item to add to the array, or create a new array with the item
 * @returns array with the item added
 */
export function appendTo<T>(coll: T[] | undefined, item: T): T[] {
    if(coll === undefined) return [item];
    coll.push(item);
    return coll;
}

/**
 * @internal
 * compares two dependency arrays for equality
 * uses Object.is to compare values
 * @param a the first array of Records, strings, numbers, booleans, etc.
 * @param b the second array
 * @returns true if the arrays are equal (same length and same values)
 */
export function areDepsEqual(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
    if(a.length !== b.length) return false;
    return a.every((v, i) => Object.is(v, b[i]));
}


/**
 * @internal
 * merge two maps, overwriting values in the first map with values in the second map
 * @param map1 the first map
 * @param map2 the second map
 * @returns a new map with the values from both maps
 */
export function mergeMaps<K, V>(map1: Map<K, V>, map2?: Map<K, V>): Map<K, V> {
    const merged = new Map(map1);
    map2?.forEach((v, k) => merged.set(k, v));
    return merged;
}

/**
 * get the flattened details of all failed validations.
 * @param results the validation results
 * @returns details of all failed validations.
 */
  export function invalidDetails<V>(results: AccumulatedValidationResults<V>): V[] {
    return results.results.flatMap((r) => !r.isValid ? r.details : []);
}

/**
 * An object that can contain Events or EventByKey objects, that can be nested
 */
export type EventRecord = {[ key: string ]: Event<any, any> | EventByKey<any,any> | EventRecord};

/**
 * for a nested object of Events or EventsByKey, return all Events
 * @param obj the object to search
 * @returns an array of all Events
 */
export function getAllEvents(obj: EventRecord): Event<any, any>[] {
    const events: Event<any, any>[] = [];
    for(const key in obj) {
        const value = obj[key];
        // value is an Event
        if(value instanceof Event) {
            events.push(value);
        }
        // value is an EventByKey
        else if(value instanceof EventByKey) {
            const events = value.allEvents;
            events.forEach((e) => events.push(e));
        }
        // value is an object (get next values recursively)
        else if(typeof value === 'object') {
            const nestedEvents = getAllEvents(value);
            nestedEvents.forEach((e) => events.push(e));
        }
    }
    return events;
}

/**
 * get all values from a Map
 * @param map the map to get values from
 * @returns an array of all values
 */
export function mapValues<K, V>(map: Map<K, V>): V[] {
    const values: V[] = [];
    map.forEach((v) => values.push(v));
    return values;
}

/**
 * get the key from an id-string
 * @param id the id-string
 * @returns the key
 */
export function getKeyFromId(id: string): string {
    return id.split('🔑')[1];
}
