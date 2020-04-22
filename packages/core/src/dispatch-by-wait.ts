/* eslint-disable @typescript-eslint/no-explicit-any */

import { Bid, BidsForBidType, GuardFunction } from './bid';
import { ActionType } from './action';
import { ActionDispatch } from './update-loop';
import { FCEvent, EventMap } from './event';


// function combinedGuardFn(waits: BidsForBidType, event: FCEvent): GuardFunction {
//     const all = waits[eventId].reduce((acc: GuardFunction[], curr: Bid) => {
//         if(curr.guard) {
//             acc.push(curr.guard);
//         }
//         return acc;
//     }, []);
//     return (val: any): boolean => {
//         if(all.length === 0) return true;
//         return all.some((g): boolean => g(val));
//     }
// }

export function dispatchByWait(dispatch: ActionDispatch, waits: BidsForBidType): EventMap<ActionDispatch> {
    if(!waits) return new EventMap();
    return waits.map((event, value) => (payload?: unknown): void => dispatch({ type: ActionType.dispatched, event: event, payload: payload, threadId: "" }));
}