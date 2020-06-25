import { BidsForBidType, Bid } from './bid';
import { ActionType } from './action';
import { ActionDispatch } from './update-loop';
import { FCEvent, EventMap, toEvent } from './event';
import { getGuardForEventDispatch, GuardFunction } from './guard';

export type TriggerDispatch = () => void
type CachedDispatch = (payload: any) => TriggerDispatch | undefined;
export type EventDispatch = (event: FCEvent | string, payload?: any) => TriggerDispatch | undefined;
type EventDispatchUpdater = (waits: BidsForBidType) => void;

interface DispatchCache {
    payload?: any;
    dispatch?: TriggerDispatch | undefined;
}


export function setupEventDispatcher(dispatch: ActionDispatch): [EventDispatchUpdater, EventDispatch] {
    const dispatchByEvent = new EventMap<CachedDispatch>();
    const guardByEvent = new EventMap<GuardFunction | undefined>();
    const dispatchFunction: EventDispatch = (event: FCEvent | string, payload?: any): TriggerDispatch | undefined  => {
        const REPLAY_EVENT_NAME = '___REPLAY___';
        if(event === REPLAY_EVENT_NAME) {
            dispatch({type: ActionType.replay, payload: payload, threadId: "", event: {name: REPLAY_EVENT_NAME}});
            return undefined
        }
        const dp = dispatchByEvent.get(toEvent(event));
        if(dp === undefined) return undefined;
        return dp(payload);
    }
    const updateEventDispatcher = (waits: BidsForBidType): void => {
        guardByEvent.clear();
        const dpWaits = new EventMap<Bid[]>();
        waits?.forEach((event, bids) => {
            const newBids = bids.filter(bid => bid.event.dispatchEnabled !== false);
            if(newBids.length > 0) dpWaits.set(event, newBids);
        })
        if(!dpWaits || dpWaits.size() === 0) { 
            dispatchByEvent.clear();
            return;
        }
        dispatchByEvent.intersection(dpWaits);
        dpWaits.forEach((waitEvent) => {
            guardByEvent.set(waitEvent, getGuardForEventDispatch(dpWaits, waitEvent));
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
    }
    return [updateEventDispatcher, dispatchFunction];
}  