// angular-shared start
import { signal, Signal } from "@preact/signals";
import { Event } from "../core/index.ts";


export function getSignal<P, V>(event: Event<P, V>) {
    const eventSignal = signal<Event<P, V>>(event);
    event.registerCallback(() => {
        eventSignal.value = event;
    });
    return eventSignal;
}


type MapToSignal<T> = {
    [K in keyof T]: T[K] extends Event<infer V, infer B>
        ? Signal<Event<V, B>>
        : MapToSignal<T[K]>;
};


export function mapToSignals<T>(obj: T): MapToSignal<T> {
    const result: any = {};
    for (const key in obj) {
        const item = obj[key];
        if (item instanceof Event) {
            result[key] = getSignal(item);
        } else {
            result[key] = mapToSignals(item);
        }
    }
    return result;
}