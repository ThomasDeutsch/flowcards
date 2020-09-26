import { EventMap, EventId } from './event-map';
import { Bid, BidsByType, BidType, isBlocked, hasValidMatch } from './bid';
import * as utils from './utils';
import { isGuardPassed } from './guard';
import { PendingEventInfo, BThreadId } from './bthread';
import { ActionDispatch } from './update-loop';
import { ActionType } from './action';
import { GetCachedItem, CachedItem } from './event-cache';

//TODO: Typing of CachedItem
//TODO: Typing of bid returns.

export interface EventInfo {
    bThreadId?: BThreadId;
    event?: EventId;
    type?: BidType;
    details?: any;
}

function getResultDetails(result: boolean | { isValid: boolean; details?: string | undefined }): any {
    return (typeof result !== 'boolean') ? result.details : undefined;
}

type ResultType = 'valid' | 'invalid' | 'noWait'

export type ExplainResult = {
    type: ResultType;
    valid: EventInfo[]; 
    invalid: EventInfo[];
}

export class EventContext {
    private _actionDispatch: ActionDispatch;
    private _eventId: EventId;
    private _cachedItem?: CachedItem<any>;
    private _lastUpdatedOnActionId = -1;
    public get value() {
        return this._cachedItem?.value;
    }
    public get history() {
        return this._cachedItem?.history|| [];
    }
    private _bidsByType: BidsByType;
    private _dispatchEnabled = false;
    private _pending: PendingEventInfo | undefined;
    public get pending() {
        return this._pending;
    }
    
    public explain(payload?: any): ExplainResult {
        const blocks = utils.flattenShallow(this._bidsByType.block?.getExactMatchAndUnkeyedMatch(this._eventId));
        const waits = utils.flattenShallow(this._bidsByType?.wait?.getAllMatchingValues(this._eventId)); // include ON bids, but they will not say, if a result is valid or not.
        const infos: ExplainResult  = {type: 'noWait', valid: [], invalid: []};
        waits?.forEach(bid => {
            const guardResult = bid.guard?.(payload);
            if(bid.event.name === 'nyWaitBid1') {
                console.log('TEST!: ', guardResult, bid)
            }
            if(guardResult === undefined) {

                infos.valid.push({
                    bThreadId: bid.bThreadId,
                    event: bid.event,
                    type: bid.type
                });
                return;
            }
            const isValid = isGuardPassed(guardResult);
            const result = {
                bThreadId: bid.bThreadId,
                event: bid.event,
                type: bid.type,
                details: getResultDetails(guardResult),
            }
            if(isValid) {
                infos.valid.push(result);
            } 
            else {
                infos.invalid.push(result);
            }
        });
        blocks?.forEach(bid => {
            const guardResult = bid.guard?.(payload);
            if(guardResult === undefined) {
                infos.invalid.push({
                    bThreadId: bid.bThreadId,
                    event: bid.event,
                    type: bid.type,
                    details: 'blocked'
                });
                return;
            }
            const isValid = isGuardPassed(guardResult);
            const info = {
                bThreadId: bid.bThreadId,
                event: bid.event,
                type: bid.type,
                details: getResultDetails(guardResult)
            }
            if(isValid) {
                infos.invalid.push(info);
            } else {
                infos.valid.push(info);
            }
        });
        return infos;
    }

    private _dispatch(payload: any): boolean {  
        if(isBlocked(this._bidsByType, this._eventId, {payload: payload})) return false; 
        if(hasValidMatch(this._bidsByType, BidType.wait, this._eventId, {payload: payload})) {
            this._actionDispatch({id: null, type: ActionType.ui, event: this._eventId, payload: payload, bThreadId: {id: ""}});
            return true;
        }
        return false;
    }

    public get dispatch(): ((payload: any) => boolean) | undefined {
        if(this._dispatchEnabled) return this._dispatch.bind(this);
        return undefined;
    }

    constructor(actionDispatch: ActionDispatch, eventId: EventId) {
        this._actionDispatch = actionDispatch;
        this._eventId = eventId;
        this._bidsByType = {} as BidsByType;
    }

    public update(bidsByType: BidsByType, pendingEventMap: EventMap<PendingEventInfo>, getCachedItem: GetCachedItem, actionId: number) {
        if(this._lastUpdatedOnActionId === actionId) return;
        this._lastUpdatedOnActionId = actionId;
        this._bidsByType = bidsByType;
        this._pending = pendingEventMap.get(this._eventId);
        this._cachedItem = getCachedItem(this._eventId);
        this._dispatchEnabled = !isBlocked(this._bidsByType, this._eventId) && hasValidMatch(this._bidsByType, BidType.wait, this._eventId);
    }
}