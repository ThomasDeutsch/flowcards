export type EventKey = string;
export type EventName = string;

export interface Event {
    name: string;
    key: string;
}

export function toEvent(e: string | Event): Event {
    const te = (typeof e === 'string') ? {name: e} : e;
    return {key: '__NOKEY_', ...te};
}


export class EventKeyRecord<T>  {
    public record: Record<EventName, Record<EventKey, T>> = {}
    constructor() {
    }

    public add(event: Event, value: T): EventKeyRecord<T> {
        if(!this.record[event.name]) this.record[event.name] = {};
        this.record[event.name][event.key] = value;
        return this;
    }

    public get(event: Event): T | undefined {
        return this.record[event.name]?.[event.key];
    }

    public has(event: Event): boolean {
        return this.record[event.name]?.[event.key] !== undefined;
    }

    public isEmpty(): boolean {
        return Object.keys(this.record).length === 0;
    }

    public delete(event: Event): boolean {
        if(!this.has(event)) return false;
        delete this.record[event.name][event.key];
        if(Object.keys(this.record[event.name]).length === 0) {
            delete this.record[event.name];
        }
        return true;
    }

    public clear(): Event[] | null {
        let clearedEvents: Event[] = []
        Object.keys(this.record).forEach(eventName => {
            Object.keys(this.record[eventName]).forEach(key => {
                const event = {name: eventName, key: key};
                this.delete(event)
                clearedEvents.push(event);
            })
        });
        return clearedEvents;
    }

    public getAllEvents(): Event[] | null {
        let elements: Event[] = [];
        Object.keys(this.record).forEach(eventName => {
            Object.keys(this.record[eventName]).forEach(key => {
                elements.push({name: eventName, key: key});
            })
        });
        return elements.length > 0 ? elements : null;
    }

    public allElements(): [Event, T][] {
        let elements: [Event, T][] = [];
        Object.keys(this.record).forEach(eventName => {
            Object.keys(this.record[eventName]).forEach(key => {
                elements.push([{name: eventName, key: key}, this.record[eventName][key]]);
            })
        });
        return elements;
    }
}


type ReducerFunction<T,X> = (acc: X, curr: T, ) => X;

export function reduceEventKeyRecords<T, X>(records: EventKeyRecord<T>[], reducer: ReducerFunction<T, X>): EventKeyRecord<X> {
    const result = new EventKeyRecord<X>();
    records.map(r => r.allElements()).forEach(r => r.map(([event, value]) => {
        const addValue = reducer(result.record[event.name]?.[event.key], value);
        result.add(event, addValue);
    }));
    return result
}