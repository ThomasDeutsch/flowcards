import { AccumulatedValidationResults } from "./payload-validation.ts";
import { Event, EventByKey } from "./event.ts";

/**
 * @internal
 * check if a value is thenable (possibly a promise)
 * @param p a possible candidate for a promise
 * @returns true if p is a promise
 * @internalRemarks promise duck-typing:  https://github.com/then/is-promise/blob/master/index.js
 */
export function isThenable(obj: any): obj is Promise<any> {
    return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function';
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
 * An object that can contain Events or EventByKey objects, that can be nested
 */
export type EventRecord = {[ key: string ]: Event<any, any> | EventByKey<any,any> | EventRecord};

/**
 * for a nested object of Events or EventsByKey, return all Events
 * @param obj the object to search
 * @returns an array of all Events
 */
export function getEventMap(obj: EventRecord, connectEventFn?: (event: Event<any, any>) => void): Map<string, Event<any, any>> {
    let events: Map<string, Event<any, any>> = new Map();
    for(const key in obj) {
        const value = obj[key];
        // value is an Event
        if(value instanceof Event) {
            connectEventFn?.(value);
            events.set(value.id, value);
        }
        // value is an EventByKey
        else if(value instanceof EventByKey) {
            const keyedEvents = value.allEvents;
            keyedEvents.forEach((e) => {
                connectEventFn?.(e);
                events.set(e.id, e);
            });
        }
        // value is an object (get next values recursively)
        else if(typeof value === 'object') {
            const nestedEvents = getEventMap(value);
            events = mergeMaps(events, nestedEvents);
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
    return id.split('__key:')[1];
}