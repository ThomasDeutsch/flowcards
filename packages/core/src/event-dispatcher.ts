/* eslint-disable @typescript-eslint/no-explicit-any */

import { Bid, BidsForBidType, GuardFunction } from './bid';
import { ActionType } from './action';
import { ActionDispatch } from './update-loop';
import { FCEvent, EventMap, toEvent } from './event';
import * as utils from './utils';


function getGuardForEvent(eventMap: EventMap<Bid[]>, event: FCEvent): GuardFunction | undefined {
    let guards: GuardFunction[] | undefined = eventMap.get(event)?.map(bid => bid.guard).filter(utils.notUndefined);
    if(event.key !== undefined) {
        let g = getGuardForEvent(eventMap, {name: event.name}); // also get the guard from the unkeyed wait
        if(g) {
            guards = guards || [];
            guards.push(g);
        }
    }
    if(guards === undefined || guards.length === 0) return undefined;
    return (payload: any) => guards!.filter(utils.notUndefined).some(guard => guard(payload));
}

export type TriggerDispatch = () => void
type CachedDispatch = (payload: any) => TriggerDispatch | undefined;
export type EventDispatch = (event: FCEvent | string, payload?: any) => TriggerDispatch | undefined;

interface DispatchCache {
    payload?: any;
    dispatch?: TriggerDispatch | undefined;
}


export function setupEventDispatcher(dispatch: ActionDispatch) {
    const dispatchByEvent = new EventMap<CachedDispatch>();
    const guardByEvent = new EventMap<GuardFunction | undefined>();

    const dispatchFunction: EventDispatch = (event: FCEvent | string, payload?: any): TriggerDispatch | undefined  => { 
        const dp = dispatchByEvent.get(toEvent(event));
        if(!dp) return undefined;
        return dp(payload);
    }

    return (waits: BidsForBidType) => {
        guardByEvent.clear();
        if(!waits) { 
            dispatchByEvent.clear();
            return dispatchFunction;
        }
        const allWaitEvents = waits.getAllEvents();
        if(allWaitEvents === undefined) {
            dispatchByEvent.clear();
            return dispatchFunction;
        }
        dispatchByEvent.intersection(waits);
        allWaitEvents.forEach(waitEvent => {
            guardByEvent.set(waitEvent, getGuardForEvent(waits, waitEvent));
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

    