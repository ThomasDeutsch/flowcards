/* eslint-disable @typescript-eslint/no-explicit-any */

import { Bid, BidsForBidType, GuardFunction, EventName } from './bid';
import { ActionType } from './action';
import { ActionDispatch } from './update-loop';

export type TriggerDispatch = Function | undefined;
export type GuardedDispatch = (valueToDispatch: any, key?: string | number) => TriggerDispatch;
export type DispatchByWait = Record<EventName, GuardedDispatch>;

interface Cache {
    payload?: any;
    dispatch?: Function;
    key?: string | number;
}


function removeUnusedWaits(previous: Record<EventName, any>, waits: Record<EventName, Bid[]>): void {
    Object.keys(previous).forEach((wait) => {
        if(!waits[wait]) delete previous[wait];
    });
}

function clearObject(obj: Record<string, any>): void {
    Object.keys(obj).forEach((key) => {
        delete obj[key];
    });
}


function combinedGuardFn(waits: BidsForBidType, eventName: string): GuardFunction {
    const all = waits[eventName].reduce((acc: GuardFunction[], curr: Bid) => {
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


export function dispatchByWait(dispatch: ActionDispatch, dbwObj: DispatchByWait, combinedGuardByWait: Record<EventName, GuardFunction>, waits: BidsForBidType): DispatchByWait {
    removeUnusedWaits(dbwObj, waits); // keep the cache for all waits
    clearObject(combinedGuardByWait); 
    return Object.keys(waits).reduce((acc, eventName): DispatchByWait  => {
        combinedGuardByWait[eventName] = combinedGuardFn(waits, eventName); // renew all guard-functions.
        if(!acc[eventName]) {  // create a new cache
            const cacheByKey: Record<string, Cache> = {};
            acc[eventName] = (payload?: any, key?: string | number): TriggerDispatch => {
                if(key === undefined) key = "default";
                if(!combinedGuardByWait[eventName](payload)) { // invalid payload
                    delete cacheByKey[key];
                    return undefined
                }
                if(cacheByKey[key] && Object.is(payload, cacheByKey[key].payload)) return cacheByKey[key].dispatch;
                cacheByKey[key] = { 
                    payload: payload, 
                    dispatch: (): void => dispatch({ type: ActionType.dispatched, eventName: eventName, payload: payload, threadId: "" })
                };
                return cacheByKey[key].dispatch;
            }
        }
        return acc;
    }, dbwObj);
}