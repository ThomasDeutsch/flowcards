import { EventMap, FCEvent } from './event';
import { Bid } from './bid';
import * as utils from './utils';
import { isGuardPassed } from './guard';
import { PendingEventInfo } from './bthread';


export interface EventInfo {
    type: 'no check' | 'valid' | 'invalid' | 'blocked' | 'pending' | 'no wait';
    event?: FCEvent;
    threadId?: string;
    details?: any;
}

export function explain(waits: EventMap<Bid[]> | undefined, blocks: EventMap<Bid[]> | undefined, pending: EventMap<PendingEventInfo>, event: FCEvent, payload: any): EventInfo[] {
    const infos: EventInfo[] = [];
    const waitsColl = utils.flattenShallow(waits?.getAllMatchingValues(event));
    if(waitsColl === undefined) {
        infos.push({
            type: 'no wait'
        });
    } else {
        waitsColl.forEach(bid => {
            const guardResult = bid.guard?.(payload);
            if(guardResult === undefined) {
                infos.push({
                    type: 'no check',
                    threadId: bid.threadId,
                    event: bid.event
                });
            }
            else if(isGuardPassed(guardResult)) {
                infos.push({
                    type: 'valid',
                    threadId: bid.threadId,
                    details: guardResult,
                    event: bid.event
                });
            }
            else {
                infos.push({
                    type: 'invalid',
                    threadId: bid.threadId,
                    details: guardResult,
                    event: bid.event
                });
            }
        });
    }
    const blocksColl = utils.flattenShallow(blocks?.getExactMatchAndUnkeyedMatch(event));
    blocksColl.forEach(bid => {
        const guardResult = bid.guard?.(payload);
        if(guardResult === undefined || isGuardPassed(guardResult)) {
            infos.push({
                type: 'blocked',
                threadId: bid.threadId,
                details: guardResult,
                event: bid.event
            });
        }
    });
    const pendingColl = pending?.getExactMatchAndUnkeyedMatch(event);
    pendingColl.forEach(pendingInfo =>
        infos.push({
            type: 'pending',
            threadId: pendingInfo.threadId,
            event: pendingInfo.event
        })
    );
    return infos;
}