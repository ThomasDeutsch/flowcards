import { EventMap, FCEvent } from './event';

export type EventCache = EventMap<CachedItem<any>>;

export interface CachedItem<T> {
    current: T;
    history: T[];
    initial: () => T;
    reset: () => void;
    set: (payload: T) => void;
}

export type EnableEventCache<T> = (event: FCEvent | string, initial?: T) => CachedItem<T>;

export function setEventCache<T>(isUpdate: boolean, eventCache: EventCache, event: FCEvent | undefined, payload?: T): void {
    if (!event) return;
    const events = eventCache.getAllMatchingEvents(event);
    if(!events) return;
    events.forEach(event => {
        const val = eventCache.get(event);
        if(val === undefined) {
            eventCache.set(event, {
                current: payload, 
                history: [payload],
                set: (payload: any) => setEventCache(true, eventCache, event, payload),
                reset: function() { setEventCache(true, eventCache, event, this.history[0]) },
                initial: function() { return this.history[0] },
            });
        } else if(isUpdate) {
            val.current = payload;
            val.history.push(payload);
        }
    }); 
}