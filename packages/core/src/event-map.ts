import { notUndefined } from './utils';

export type EventKey = string | number;
type EventIteratorFunction<T> = (e: EventId, value: T) => any;

export interface EventId {
    name: string;
    key?: EventKey;
    description?: string;
}

export function toEventId(e: string | EventId): EventId {
    return (typeof e === 'string') ? {name: e} : {...e};
}

export function sameEventId(a: EventId, b: EventId): boolean {
    return (a.name === b.name) && (a.key === b.key);
}

export class EventMap<T>  {
    public noKey: Map<string, T>;
    public withKey: Map<string, Map<EventKey, T>>;

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

    public set(event: EventId, value: T): EventMap<T> {
        if(event.key === undefined) {
            this.noKey.set(event.name, value);
        } else {
            if(!this.withKey.has(event.name)) this.withKey.set(event.name, new Map<EventKey, T>());
            this.withKey.get(event.name)?.set(event.key, value);
        }
        return this;
    }

    public get(event: EventId): T | undefined {
        if(event.key === undefined) {
            return this.noKey.get(event.name);
        } else {
            return this.withKey.get(event.name)?.get(event.key);
        }
    }

    public getExactMatchAndUnkeyedMatch(event: EventId): T[] | undefined {
        const noKeyResult = this.noKey.get(event.name)
        if(event.key === undefined) {
            return (noKeyResult !== undefined) ? [noKeyResult] : undefined
        }
        const withKeyResult = this.withKey.get(event.name)?.get(event.key);
        if(withKeyResult === undefined && noKeyResult === undefined) return undefined;
        return [noKeyResult, withKeyResult].filter(notUndefined);
    }

    public has(event: EventId | string): boolean {
        event = toEventId(event);
        if(event.key === undefined) {
            return this.noKey.has(event.name);
        } else {
            return !!this.withKey.get(event.name)?.has(event.key);
        }
    }

    public deleteSingle(event: EventId): boolean {
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

    public clear(): void {
        this.withKey.clear();
        this.noKey.clear();
    }

    public clone(): EventMap<T> {
        const clone = new EventMap<T>();
        this.forEach((event, value) => {
            clone.set(event, value);
        });
        return clone;
    }

    public get allValues(): T[] | undefined {
        const elements: T[] = [];
        this.forEach((event, value) => elements.push(value));
        return elements.length > 0 ? elements : undefined;
    }

    public merge(em: EventMap<T> | undefined): EventMap<T> {
        if(!em) return this;
        em.forEach((event, value) => {
            this.set(event, value);
        });
        return this;
    }

    public hasMatching(event: EventId): boolean {
        return (this.has(event) || this.has({name: event.name})) === true;
    }
}