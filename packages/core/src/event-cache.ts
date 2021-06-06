import { EventMap, EventId } from './event-map';

export interface CachedItem<T> {
    value: T;
    history: T[];
}

export type GetCachedEvent = (eventId: EventId | string) => CachedItem<unknown> | undefined;

export function setEventCache<T>(eventCache: EventMap<CachedItem<unknown>>, event: EventId, payload?: T): void {
    const val = eventCache.get(event);
    let payloadClone: any = {};
    if(payload && (typeof payload === 'object')) {
        Object.assign(payloadClone, payload);
    } else {
        payloadClone = payload;
    }
    if(val === undefined) {
        const newCachedVal = {
            history: [payloadClone],
            value: payloadClone
        }
        eventCache.set(event, newCachedVal);
    } else {
        const newCachedVal = {
            history: [...val.history, payloadClone],
            value: payloadClone
        }
        eventCache.set(event, newCachedVal);
    }
}
