import { BidsForBidType } from './bid';
import { ActionType } from './action';
import { ActionDispatch } from './update-loop';
import { FCEvent, EventMap, toEvent } from './event';
import { getGuardForEventDispatch, GuardFunction } from './guard';

export type TriggerDispatch = () => void
type CachedDispatch = (payload: any) => TriggerDispatch | undefined;
export type EventDispatch = (event: FCEvent | string, payload?: any) => CachedDispatch | TriggerDispatch | undefined;

interface DispatchCache {
    payload?: any;
    dispatch?: TriggerDispatch | undefined;
}

export function setupEventDispatcher(dispatch: ActionDispatch) {
    const dispatchByEvent = new EventMap<CachedDispatch>();
    const guardByEvent = new EventMap<GuardFunction | undefined>();
    const dispatchFunction: EventDispatch = (event: FCEvent | string, payload?: any): CachedDispatch | TriggerDispatch | undefined  => { 
        const dp = dispatchByEvent.get(toEvent(event));
        if(dp === undefined) return undefined;
        return dp(payload);
    }
    return (waits: BidsForBidType) => {
        guardByEvent.clear();
        if(!waits || waits.size() === 0) { 
            dispatchByEvent.clear();
            return dispatchFunction;
        }
        dispatchByEvent.intersection(waits);
        waits.forEach((waitEvent, bids) => {
            guardByEvent.set(waitEvent, getGuardForEventDispatch(waits, waitEvent));
            if(!dispatchByEvent.has(waitEvent)) {
                const cache: DispatchCache = {};
                dispatchByEvent.set(waitEvent, (payload?: any): TriggerDispatch | undefined => {
                    const guard = guardByEvent.get(waitEvent);
                    if(guard && guard(payload) === false) return undefined;
                    if(cache.dispatch && Object.is(payload, cache.payload)) return cache.dispatch;
                    cache.payload = payload;
                    cache.dispatch = (): void => dispatch({ type: ActionType.dispatched, event: waitEvent, payload: payload, threadId: "" });
                    return cache.dispatch;
                });
            }
        });
        return dispatchFunction;
    }
}  