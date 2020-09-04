import { EventMap, FCEvent, EventKey, toEvent } from './event';
import { Bid, block, getMatchingBids, BidType, BidSubType } from './bid';
import * as utils from './utils';
import { isGuardPassed } from './guard';
import { PendingEventInfo, BThreadId } from './bthread';
import { EventDispatch } from './event-dispatcher';
import { GetCachedItem } from './update-loop';

export interface EventContextResult {
    isPending: boolean;
    dispatch?: (payload: any) => EventDispatch;
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

export class EventContext {
    private _getEventCache: GetCachedItem;
    private _waits?: EventMap<Bid[]>;
    private _blocks?: EventMap<Bid[]>;
    private _allPending?: EventMap<PendingEventInfo>;

    private _explain(event: FCEvent, payload?: any): ExplainResult {
        const infos: ExplainResult  = {valid: [], invalid: [], blocked: []};
        const waitsColl = utils.flattenShallow(this._waits?.getAllMatchingValues(event));
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
        const blocksColl = utils.flattenShallow(this._blocks?.getExactMatchAndUnkeyedMatch(event));
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
        const pendingEventInfo = this._allPending?.get(event);
        if(pendingEventInfo) {
            infos.pending = pendingEventInfo
        }
        return infos;
    }

    public update(waits?: EventMap<Bid[]>, blocks?: EventMap<Bid[]>, allPending?: EventMap<PendingEventInfo>) {
        this._waits = waits;
        this._blocks = blocks;
        this._allPending = allPending;
    }

    constructor(getEventCache: GetCachedItem) {
        this._getEventCache = getEventCache;
    }

    public getContext(eventName: string, eventKey?: EventKey): EventContextResult {
        const event: FCEvent = { name: eventName, key: eventKey };
        const cache =  this._getEventCache(event);
        return {
            isPending: this._allPending?.hasMatching(event) === true,
            // TODO: dispatch?: (payload: any) => EventDispatch;
            value: cache?.value,
            history: cache?.history,
            explain: (payload?: any) => this._explain(event, payload)
        }
    }
}