import { FCEvent, EventMap } from './event';
import { Bid } from './bid';
import * as utils from './utils';

export type GuardFunction = (payload: any) => boolean


export function getGuardForEvent(eventMap: EventMap<Bid[]>, event: FCEvent): GuardFunction | undefined {
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


export function getGuardedUnguardedBlocks(eventMap: EventMap<Bid[]> | undefined): [Set<FCEvent> | undefined, EventMap<GuardFunction> | undefined] {
    if(eventMap === undefined) return [undefined, undefined];
    const unguarded: FCEvent[] = [];
    const guarded = new EventMap<GuardFunction>();
    eventMap.forEach((event, bids) => {
        const guards = bids.map(bid => bid.guard).filter(utils.notUndefined);
        if(guards.length !== bids.length) unguarded.push(event);
        else guarded.set(event, (payload: any) => guards.some(guard => guard(payload)))
    });
    return [unguarded.length > 0 ? new Set(unguarded): undefined, guarded.size() > 0 ? guarded: undefined];
}


export function combineGuards(eventMap: EventMap<Bid[]>, guardedBlocks: EventMap<GuardFunction>): void {
    guardedBlocks.forEach((event, blockGuard) => {
        const bids = eventMap.get(event);
        if(!bids) return;
        const newBids = bids.map(bid => {
            const oldGuard = bid.guard;
            bid.guard = (payload: any) => (!oldGuard || oldGuard(payload)) && !blockGuard(payload);
            return bid;
        })
        eventMap.set(event, newBids);
    });
}