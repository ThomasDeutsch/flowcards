import { EventMap, FCEvent } from './event';

export type EventCache = EventMap<CachedItem<any>>;

export interface CachedItem<T> {
    value: T;
    history: T[];
    // initial: () => T;
    // reset: () => void;
    // set: (payload: T) => void;
}

export function setEventCache<T>(eventCache: EventCache, event: FCEvent, payload?: T): void {
    const events = eventCache.getAllMatchingEvents(event);
    if(!events) return;
    events.forEach(event => {
        const val = eventCache.get(event);
        if(val === undefined) {
            eventCache.set(event, {
                value: payload, 
                history: [payload],
                // set: (payload: any) => setEventCache(eventCache, event, payload),
                // reset: function() { setEventCache(eventCache, event, this.history[0]) },
                // initial: function() { return this.history[0] },
            });
        } else {
            val.value = payload;
            val.history.push(payload);
        }
    }); 
}