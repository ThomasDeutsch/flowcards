import * as utils from './utils';

export type EventName = string;
export type EventKey = string | number;
type EventIteratorFunction<T> = (e: FCEvent, value: T) => any;

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

    public size(): number {
        return this.noKey.size + this.withKey.size;
    }

    public forEach(iteratorFn: EventIteratorFunction<T>): void {
        for (const [eventName, value] of this.noKey) {
            iteratorFn({name: eventName}, value);
        }
        for (const [eventName] of this.withKey) {
            const map = this.withKey.get(eventName);
            if(map) {
                for (const [key, value] of map) {
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

    public getAllMatchingEvents(event?: FCEvent): FCEvent[] | undefined {
        if(event === undefined) return undefined;
        if(event.key === undefined) { // there was no key, so add all items with a key.
            const keys = this.withKey.get(event.name)?.keys();
            if(keys === undefined) return [event];
            const keysColl = [...keys];
            if(keysColl.length === 0) return [event];
            return [...keysColl.map(key => ({name: event.name, key: key})), event];
        } else { // there was a key, so only add the items without a key.
            return [event, {name: event.name}];
        }
    }

    public getAllMatchingValues(event?: FCEvent): T[] | undefined {
        const events = this.getAllMatchingEvents(event);
        if(events === undefined) return undefined;
        const result = events.map(event => this.get(event)).filter(utils.notUndefined);
        return (result.length === 0) ? undefined : result;
    }

    public has(event: FCEvent | string): boolean {
        event = toEvent(event);
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
        const deleted: FCEvent[] = []
        this.forEach((event) => {
            deleted.push(event);
            this.delete(event);
        });
        return deleted.length > 0 ? deleted : undefined;
    }

    public clone(): EventMap<T> {
        const clone = new EventMap<T>();
        this.forEach((event, value) => {
            clone.set(event, value);
        });
        return clone;
    }

    public get allEvents(): FCEvent[] | undefined {
        const elements: FCEvent[] = [];
        this.forEach((event) => elements.push(event));
        return elements.length > 0 ? elements : undefined;
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

    public without(a?: EventMap<any>): EventMap<T> {
        if(!a) return this;
        if(a.size() === 0) return this;
        a.forEach((event) => {
            if(this.has(event)) this.delete(event);
        });
        return this;
    }

    public merge(em: EventMap<T> | undefined): EventMap<T> {
        if(!em) return this;
        em.forEach((event, value) => {
            this.set(event, value);
        });
        return this;
    }
}