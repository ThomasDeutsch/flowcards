import { EventMap, EventId, toEventId } from './event-map';

export interface CachedItem<T> {
    value: T;
    history: T[];
}

export type GetCachedEvent<T = any> = (eventId: EventId | string) => CachedItem<T> | undefined;

export function setEventCache<T>(eventCache: EventMap<CachedItem<unknown>>, event: EventId, payload?: T): void {
    const current = eventCache.get(event);
    if(current === undefined) {
        const newCachedVal = {
            history: [payload],
            value: payload
        }
        eventCache.set(event, newCachedVal);
    } else {
        current.history.push(payload)
        current.value = payload;
        eventCache.set(event, current);
    }
}


export function getEventCache<T>(eventCache: EventMap<CachedItem<unknown>>, eventId: EventId | string): CachedItem<T> | undefined {
    const value = eventCache.get(toEventId(eventId));
    return value as CachedItem<T>;
}

