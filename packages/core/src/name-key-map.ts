import { notUndefined } from './utils';

export type Key = string | number | undefined;
type NameKeyIteratorFunction<T> = (e: NameKeyId, value: T) => any;

export interface NameKeyId {
    name: string;
    key?: Key;
}

export function toNameKeyId(e: string | NameKeyId): NameKeyId {
    return (typeof e === 'string') ? {name: e} : {...e};
}

export function sameNameKeyId(a: NameKeyId, b: NameKeyId): boolean {
    return (a.name === b.name) && (a.key === b.key);
}

export class NameKeyMap<T>  {
    public noKey: Map<string, T>;
    public withKey: Map<string, Map<Key, T>>;

    constructor() {
        this.noKey = new Map();
        this.withKey = new Map();
    }

    public get size(): number {
        return this.noKey.size + this.withKey.size;
    }

    public forEach(iteratorFn: NameKeyIteratorFunction<T>): void {
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

    public set(event: NameKeyId, value: T): NameKeyMap<T> {
        if(event.key === undefined) {
            this.noKey.set(event.name, value);
        } else {
            if(!this.withKey.has(event.name)) this.withKey.set(event.name, new Map<Key, T>());
            this.withKey.get(event.name)?.set(event.key, value);
        }
        return this;
    }

    public get(event: NameKeyId): T | undefined {
        if(event.key === undefined) {
            return this.noKey.get(event.name);
        } else {
            return this.withKey.get(event.name)?.get(event.key);
        }
    }

    public update(eventId: NameKeyId, callbackFn: (value: T | undefined) => T): NameKeyMap<T> {
        const value = this.get(eventId);
        return this.set(eventId, callbackFn(value));
    }

    public getExactMatchAndUnkeyedMatch(event: NameKeyId): T[] | undefined {
        const noKeyResult = this.noKey.get(event.name)
        if(event.key === undefined) {
            return (noKeyResult !== undefined) ? [noKeyResult] : undefined
        }
        const withKeyResult = this.withKey.get(event.name)?.get(event.key);
        if(withKeyResult === undefined && noKeyResult === undefined) return undefined;
        return [noKeyResult, withKeyResult].filter(notUndefined);
    }

    public has(event: NameKeyId | string): boolean {
        event = toNameKeyId(event);
        if(event.key === undefined) {
            return this.noKey.has(event.name);
        } else {
            return !!this.withKey.get(event.name)?.has(event.key);
        }
    }

    public deleteSingle(event: NameKeyId): boolean {
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

    public clone(): NameKeyMap<T> {
        const clone = new NameKeyMap<T>();
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

    public get allKeys(): Set<NameKeyId> | undefined {
        const events = new Set<NameKeyId>();
        this.forEach((event) => events.add(event));
        return events.size > 0 ? events : undefined;
    }

    public merge(em: NameKeyMap<T> | undefined): NameKeyMap<T> {
        if(!em) return this;
        em.forEach((event, value) => {
            this.set(event, value);
        });
        return this;
    }

    public hasMatching(event: NameKeyId): boolean {
        return (this.has(event) || this.has({name: event.name})) === true;
    }
}
