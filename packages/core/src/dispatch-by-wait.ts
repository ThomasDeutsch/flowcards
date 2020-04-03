/* eslint-disable @typescript-eslint/no-explicit-any */

import { Bid, BidArrayDictionary, GuardFunction } from './bid';
import { ActionType } from './action';
import { DispatchFunction } from './update-loop';

type TriggerDispatch = Function | null;
type DispatchValueEvaluation = (valueToDispatch: any) => TriggerDispatch;
export type DispatchByWait = Record<string, DispatchValueEvaluation>;
interface EventCache {
    payload?: any;
    dispatch?: Function;
}

function renewDBW(dwp: DispatchByWait, waits: Record<string, Bid[]>): void {
    Object.keys(dwp).forEach(wait => {
        if(!waits[wait]) delete dwp[wait];
    })
}

export function dispatchByWait(dispatch: DispatchFunction, dbw: DispatchByWait, waits: BidArrayDictionary): DispatchByWait {
    renewDBW(dbw, waits);
    return Object.keys(waits).reduce((acc: DispatchByWait, eventName): DispatchByWait  => {
        const allGuards = waits[eventName].reduce((acc: Function[], curr: Bid): Function[] => {
            if(curr.guard) {
                acc.push(curr.guard);
            }
            return acc;
        }, []);
        const combinedGuardFn = (val: any): boolean => {
            if(allGuards.length === 0) return true;
            return allGuards.some((guard): boolean => guard(val));
        }
        if(!acc[eventName]) {
            const cache: EventCache = {payload: undefined, dispatch: undefined};
            acc[eventName] = (payload?: any): TriggerDispatch => {
                if(!Object.is(payload, cache.payload)) {
                    cache.payload = payload;
                    cache.dispatch = (): void => dispatch({ type: ActionType.waited, eventName: eventName, payload: payload });
                }
                if(combinedGuardFn(payload) && cache.dispatch) {
                    return cache.dispatch;
                } else {
                    return null;
                }
            }
        }
        return acc;
    }, dbw);
}