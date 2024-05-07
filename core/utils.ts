import { Event, EventByKey } from "./event.ts";

export function isThenable(obj: any): obj is Promise<any> {
    return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function';
}

export function isDefined<T>(value: T | null | undefined): value is T {
    return (value !== null && value !== undefined);
}

export function mergeMaps<K, V>(map1: Map<K, V>, map2?: Map<K, V>): Map<K, V> {
    const merged = new Map(map1);
    map2?.forEach((v, k) => merged.set(k, v));
    return merged;
}

export type EventRecord = {[ key: string ]: Event<any, any> | EventByKey<any,any> | EventRecord};

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

export function mapValues<K, V>(map: Map<K, V>): V[] {
    const values: V[] = [];
    map.forEach((v) => values.push(v));
    return values;
}

export function equalPaths(a: string[], b: string[]): boolean {
    if(a.length !== b.length) return false;
    return a.every((s, index) => s === b[index]);
}