import { EventMap, FCEvent } from './event';

export type EventCache = EventMap<CachedItem<any>>;

export interface CachedItem<T> {
    value: T;
    history: T[];
}

export function setEventCache<T>(eventCache: EventCache, event: FCEvent, payload?: T): void {
    const events = eventCache.getAllMatchingEvents(event);
    if(!events) return;
    events.forEach(event => {
        const val = eventCache.get(event);
        if(val === undefined) {
            eventCache.set(event, {
                value: payload, 
                history: [payload]
            });
        } else {
            val.value = payload;
            val.history.push(payload);
        }
    }); 
}