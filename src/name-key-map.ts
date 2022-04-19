type IdKey = string | number | undefined;

export interface NameKeyId {
    name: string;
    key?: IdKey;
}

export function toNameKeyId(e: string | NameKeyId): NameKeyId {
    return (typeof e === 'string') ? {name: e} : {...e};
}

export function isSameNameKeyId(a?: NameKeyId, b?: NameKeyId): boolean {
    if(!a || !b) return false;
    return a.name === b.name && a.key === b.key;
}

export class NameKeyMap<T>  {
    public noKey: Map<string, T>;
    public withKey: Map<string, Map<IdKey, T>>;

    constructor() {
        this.noKey = new Map();
        this.withKey = new Map();
    }

    public set(event: NameKeyId, value: T): NameKeyMap<T> {
        if(event.key === undefined) {
            this.noKey.set(event.name, value);
        } else {
            if(!this.withKey.has(event.name)) this.withKey.set(event.name, new Map<IdKey, T>());
            this.withKey.get(event.name)?.set(event.key, value);
        }
        return this;
    }

    public get(event?: NameKeyId): T | undefined {
        if(event === undefined) return undefined;
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

    public has(event: NameKeyId | string): boolean {
        event = toNameKeyId(event);
        if(event.key === undefined) {
            return this.noKey.has(event.name);
        } else {
            return !!this.withKey.get(event.name)?.has(event.key);
        }
    }

    public delete(event: NameKeyId): boolean {
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

    public get allValues(): T[] | undefined {
        const elements: T[] = [];
        this.noKey.forEach(t => elements.push(t));
        this.withKey.forEach(inner => inner.forEach(t => elements.push(t)));
        return elements.length > 0 ? elements : undefined;
    }

    public get allKeys(): NameKeyId[] | undefined {
        const keys: NameKeyId[] = [];
        this.noKey.forEach((v, name) => keys.push({name}));
        this.withKey.forEach((outer, name) => outer.forEach((inner, key) => keys.push({name, key})));
        return keys.length > 0 ? keys : undefined;
    }
}
