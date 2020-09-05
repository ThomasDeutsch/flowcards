import { EventMap, FCEvent, EventKey, toEvent } from './event';
import { Bid, block, getMatchingBids, BidType, BidSubType } from './bid';
import * as utils from './utils';
import { isGuardPassed } from './guard';
import { PendingEventInfo, BThreadId } from './bthread';
import { EventDispatch, TriggerDispatch } from './event-dispatcher';
import { GetCachedItem } from './update-loop';

export interface EventContextResult {
    isPending: boolean;
    dispatch?: TriggerDispatch;
    value: any;
    history?: any[];
    explain: (payload?: any) => ExplainResult;
}

export interface EventInfo {
    bThreadId?: BThreadId;
    bid: Bid;
    details?: any;
}

function getResultDetails(result: boolean | { isValid: boolean; details?: string | undefined }): any {
    return (typeof result !== 'boolean') ? result.details : undefined;
}

type ExplainResult = {valid: EventInfo[]; invalid: EventInfo[]; blocked: EventInfo[]; pending?: PendingEventInfo}

//TODO: make this a function?!!!!
export class EventContext {
    private _getEventCache: GetCachedItem;

    private _explain(event: FCEvent, payload?: any, waits?: EventMap<Bid[]>, blocks?: EventMap<Bid[]>, allPending?: EventMap<PendingEventInfo>): ExplainResult {
        const infos: ExplainResult  = {valid: [], invalid: [], blocked: []};
        const waitsColl = utils.flattenShallow(waits?.getAllMatchingValues(event));
        if(waitsColl !== undefined) {
            waitsColl.forEach(bid => {
                const guardResult = bid.guard?.(payload);
                if(guardResult === undefined) {
                    infos.valid.push({
                        bThreadId: bid.bThreadId,
                        bid: bid
                    });
                }
                else if(isGuardPassed(guardResult)) {
                    infos.valid.push({
                        bThreadId: bid.bThreadId,
                        details: getResultDetails(guardResult),
                        bid: bid
                    });
                }
                else {
                    infos.invalid.push({
                        bThreadId: bid.bThreadId,
                        details: getResultDetails(guardResult),
                        bid: bid
                    });
                }
            });
        }
        const blocksColl = utils.flattenShallow(blocks?.getExactMatchAndUnkeyedMatch(event));
        blocksColl.forEach(bid => {
            const guard = bid.guard;
            if(!guard) {
                infos.blocked.push({
                    bThreadId: bid.bThreadId,
                    bid: bid
                });
                return;
            }
            const guardResult = guard(payload);
            if(isGuardPassed(guardResult)) {
                infos.blocked.push({
                    bThreadId: bid.bThreadId,
                    details: getResultDetails(guardResult),
                    bid: bid
                });
            } else {
                infos.valid.push({
                    bThreadId: bid.bThreadId,
                    details: getResultDetails(guardResult),
                    bid: bid
                });
            }
        });
        const pendingEventInfo = allPending?.get(event);
        if(pendingEventInfo) {
            infos.pending = {...pendingEventInfo}
        }
        return infos;
    }

    constructor(getEventCache: GetCachedItem) {
        this._getEventCache = getEventCache;
    }

    public getContext(eventDispatch: EventDispatch, eventName: string, eventKey?: EventKey, waits?: EventMap<Bid[]>, blocks?: EventMap<Bid[]>, allPending?: EventMap<PendingEventInfo>): EventContextResult {
        const event: FCEvent = { name: eventName, key: eventKey };
        const cache = this._getEventCache(event);
        return {
            isPending: allPending?.get(event) !== undefined,
            dispatch: eventDispatch(event),
            value: cache?.value,
            history: cache?.history,
            explain: (payload?: any) => this._explain(event, payload, waits, blocks, allPending)
        }
    }
}