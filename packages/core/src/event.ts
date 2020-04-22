export type EventName = string;
export type EventKey = string | number;

export interface Event {
    name: EventName;
    key?: EventKey;
}

export function toEvent(e: string | Event): Event {
    return (typeof e === 'string') ? {name: e} : e;
}

type EventIteratorFunction<T> = (e: Event, value: T) => unknown;

export class EventMap<T>  {
    public noKey: Map<EventName, T>;
    public withKey: Map<EventName, Map<EventKey, T>>;

    constructor() {
        this.noKey = new Map();
        this.withKey = new Map();
    }

    private _iterateAll(iteratorFn: EventIteratorFunction<T>) {
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

    public set(event: Event, value: T): EventMap<T> {
        if(event.key === undefined) {
            this.noKey.set(event.name, value);
        } else {
            if(!this.withKey.has(event.name)) this.withKey.set(event.name, new Map());
            this.withKey.get(event.name)?.set(event.key, value);
        }
        return this;
    }

    public get(event: Event): T | undefined {
        if(event.key === undefined) {
            return this.noKey.get(event.name);
        } else {
            return this.withKey.get(event.name)?.get(event.key);
        }
    }

    public has(event: Event): boolean {
        if(event.key === undefined) {
            return this.noKey.has(event.name);
        } else {
            return !!this.withKey.get(event.name)?.has(event.key);
        }
    }

    public isEmpty(): boolean {
        return (this.withKey.size === 0) && (this.noKey.size === 0);
    }

    public delete(event: Event): boolean {
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

    public clear(): Event[] | null {
        let deleted: Event[] = []
        this._iterateAll((event) => {
            deleted.push(event);
            this.delete(event);
        });
        return deleted.length > 0 ? deleted : null;
    }

    public getAllEvents(): Event[] | null {
        let elements: Event[] = [];
        this._iterateAll((event) => elements.push(event));
        return elements.length > 0 ? elements : null;
    }

    public allElements(): [Event, T][] {
        let elements: [Event, T][] = [];
        this._iterateAll((event, value) => {
            elements.push([event, value]);
        });
        return elements;
    }
}


type ReducerFunction<T,X> = (acc: X, curr: T) => X;

export function reduceEventMaps<T, X>(records: EventMap<T>[], reducer: ReducerFunction<T, X>, initialValue: X): EventMap<X> {
    const result = new EventMap<X>();
    records.map(r => r.allElements()).forEach(r => r.map(([event, valueCurr]) => {
        const valueAcc = result.get(event) || initialValue;
        const addValue = reducer(valueAcc, valueCurr);
        result.set(event, addValue);
    }));
    return result;
}