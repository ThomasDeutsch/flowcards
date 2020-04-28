import * as utils from './utils';

export type EventName = string;
export type EventKey = string | number;
type EventIteratorFunction<T> = (e: FCEvent, value: T) => any;
type EventMapFunction<T, X> = (e: FCEvent, value: T) => X;

export interface FCEvent {
    name: EventName;
    key?: EventKey;
}

export function toEvent(e: string | FCEvent): FCEvent {
    return (typeof e === 'string') ? {name: e} : e;
}

export class EventMap<T>  {
    public noKey: Map<EventName, T>;
    public withKey: Map<EventName, Map<EventKey, T>>;

    constructor() {
        this.noKey = new Map();
        this.withKey = new Map();
    }

    public size() {
        return this.noKey.size + this.withKey.size;
    }

    public forEach(iteratorFn: EventIteratorFunction<T>) {
        for (let [eventName, value] of this.noKey) {
            iteratorFn({name: eventName}, value);
        }
        for (let [eventName] of this.withKey) {
            const map = this.withKey.get(eventName);
            if(map) {
                for (let [key, value] of map) {
                    iteratorFn({name: eventName, key: key}, value);
                }
            }
        }
    }

    public set(event: FCEvent, value: T): EventMap<T> {
        if(event.key === undefined) {
            this.noKey.set(event.name, value);
        } else {
            if(!this.withKey.has(event.name)) this.withKey.set(event.name, new Map());
            this.withKey.get(event.name)?.set(event.key, value);
        }
        return this;
    }

    public get(event: FCEvent): T | undefined {
        if(event.key === undefined) {
            return this.noKey.get(event.name);
        } else {
            return this.withKey.get(event.name)?.get(event.key);
        }
    }

    public getAllMatchingItems(event?: FCEvent): T[] | undefined {
        if(event === undefined) return undefined;
        let result: T[] | undefined;
        if(event.key === undefined) { // there was no key, so add all items with a key.
            let noKeyItem = this.get(event);
            let withKeyItems = this.withKey.get(event.name)?.values();
            result = [...withKeyItems || [], noKeyItem].filter(utils.notUndefined);
        } else { // there was a key, so only add the items without a key.
            let withKeyItem = this.get(event);
            let noKeyItem = this.get({name: event.name});
            result = [withKeyItem, noKeyItem].filter(utils.notUndefined);
        }
        return (result.length === 0) ? undefined : result;
    }

    public has(event: FCEvent): boolean {
        if(event.key === undefined) {
            return this.noKey.has(event.name);
        } else {
            return !!this.withKey.get(event.name)?.has(event.key);
        }
    }

    public isEmpty(): boolean {
        return (this.withKey.size === 0) && (this.noKey.size === 0);
    }

    public delete(event: FCEvent): boolean {
        if(!this.has(event)) return false;
        if(event.key === undefined) {
            return this.noKey.delete(event.name);
        }
        const hasDeletedKey = !!this.withKey.get(event.name)?.delete(event.key);
        if(hasDeletedKey && this.withKey.get(event.name)?.size === 0) {
            this.withKey.delete(event.name); // remove the map for this event-name if it is empty.
        }
        return hasDeletedKey;
    }

    public clear(): FCEvent[] | undefined {
        let deleted: FCEvent[] = []
        this.forEach((event) => {
            deleted.push(event);
            this.delete(event);
        });
        return deleted.length > 0 ? deleted : undefined;
    }

    public getAllEvents(): FCEvent[] | undefined {
        let elements: FCEvent[] = [];
        this.forEach((event) => elements.push(event));
        return elements.length > 0 ? elements : undefined;
    }

    public map<X>(mapFunction: EventMapFunction<T, X>):  EventMap<X> {
        const mapped = new EventMap<X>();
        this.forEach((event, value) => {
            mapped.set(event, mapFunction(event, value));
        })
        return mapped;
    }

    public difference(a?: EventMap<any>): EventMap<T> {
        if(a === undefined) return this;
        this.forEach((event) => {
            if(a.has(event)) this.delete(event);
        });
        return this;
    }
    
    public intersection(a?: EventMap<any>): EventMap<T> {
        if(a === undefined) {
            this.clear();
            return this;
        }
        this.forEach((event) => {
            if(!a.has(event)) this.delete(event);
        });
        return this;
    }
}

type ReducerFunction<T,X> = (acc: X | undefined, curr: T, event: FCEvent) => X;

export function reduceEventMaps<T, X>(maps: (EventMap<T> | undefined)[], reducer: ReducerFunction<T, X>): EventMap<X> | undefined {
    const notUndefinedMaps = maps.filter(utils.notUndefined);
    if(notUndefinedMaps.length === 0) return undefined
    const result = new EventMap<X>();
    notUndefinedMaps.map(r => r.forEach((event, valueCurr) => {
        const valueAcc = result.get(event);
        const addValue = reducer(valueAcc, valueCurr, event);
        result.set(event, addValue);
    }));
    return result;
}