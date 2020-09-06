import { EventMap, EventId } from './event-map';

export interface CachedItem<T> {
    value: T;
    history: T[];
}

export type GetCachedItem = (event: EventId | string) => CachedItem<any> | undefined;

export function setEventCache<T>(eventCache: EventMap<CachedItem<any>>, event: EventId, payload?: T): void {
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