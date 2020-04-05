/* eslint-disable @typescript-eslint/no-explicit-any */

import { Bid, BidArrayDictionary, GuardFunction } from './bid';
import { ActionType } from './action';
import { DispatchFunction } from './update-loop';

type TriggerDispatch = Function | undefined;
export type GuardedDispatch = (valueToDispatch: any) => TriggerDispatch;
export type DispatchByWait = Record<string, GuardedDispatch>;
interface EventCache {
    payload?: any;
    dispatch?: Function;
}

function removeUnusedWaits(rec: Record<string, any>, waits: Record<string, Bid[]>): void {
    Object.keys(rec).forEach((wait): void => {
        if(!waits[wait]) delete rec[wait];
    });
}

function combinedGuardFn(waits: BidArrayDictionary, eventName: string): GuardFunction {
    const all = waits[eventName].reduce((acc: GuardFunction[], curr: Bid): GuardFunction[] => {
        if(curr.guard) {
            acc.push(curr.guard);
        }
        return acc;
    }, []);
    return (val: any): boolean => {
        if(all.length === 0) return true;
        return all.some((g): boolean => g(val));
    }
}

export function dispatchByWait(dispatch: DispatchFunction, dbw: DispatchByWait, combinedGuardByWait: Record<string, GuardFunction>, waits: BidArrayDictionary): DispatchByWait {
    removeUnusedWaits(dbw, waits);
    removeUnusedWaits(combinedGuardByWait, waits);
    return Object.keys(waits).reduce((acc: DispatchByWait, eventName): DispatchByWait  => {
        combinedGuardByWait[eventName] = combinedGuardFn(waits, eventName);
        if(!acc[eventName]) {
            const cache: EventCache = {payload: undefined, dispatch: undefined};
            acc[eventName] = (payload?: any): TriggerDispatch => {
                if(!cache.payload || !Object.is(payload, cache.payload)) {
                    cache.payload = payload;
                    cache.dispatch = (): void => dispatch({ type: ActionType.waited, eventName: eventName, payload: payload });
                }
                if(combinedGuardByWait[eventName](payload) && cache.dispatch) {
                    return cache.dispatch;
                } else {
                    return undefined;
                }
            }
        }
        return acc;
    }, dbw);
}