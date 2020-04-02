/* eslint-disable @typescript-eslint/no-explicit-any */

import { Bid, BidArrayDictionary } from './bid';
import { ActionType } from './action';
import { DispatchFunction } from './update-loop';

type TriggerDispatch = Function | null;
type DispatchValueEvaluation = (valueToDispatch: any) => TriggerDispatch;
export type DispatchByWait = Record<string, DispatchValueEvaluation>;


export function dispatchByWait(dispatch: DispatchFunction, waits: BidArrayDictionary): DispatchByWait {
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
        acc[eventName] = (payload?: any): Function | null => {
            if(combinedGuardFn(payload)) {
                return (): Function | void => dispatch({ type: ActionType.waited, eventName: eventName, payload: payload });
            } else {
                return null;
            }
        }
        return acc;
    }, {});
}