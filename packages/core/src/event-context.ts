import { EventMap, EventId } from './event-map';
import { Bid, BidSubType, AllBidsByType } from './bid';
import * as utils from './utils';
import { isGuardPassed, getGuardForWaits } from './guard';
import { PendingEventInfo, BThreadId } from './bthread';
import { ActionDispatch } from './update-loop';
import { ActionType } from './action';
import { GetCachedItem } from './event-cache';

export interface EventInfo {
    bThreadId?: BThreadId;
    bid: Bid;
    details?: any;
}

function getResultDetails(result: boolean | { isValid: boolean; details?: string | undefined }): any {
    return (typeof result !== 'boolean') ? result.details : undefined;
}

type ExplainResult = {valid: EventInfo[]; invalid: EventInfo[]; blocked: EventInfo[] }

export class EventContext {
    private _actionDispatch: ActionDispatch;
    private _eventId: EventId;
    private _value: any;
    public get value() {
        return this._value;
    }
    private _history?: any[];
    public get history() {
        return this._history || [];
    }
    private _blocks: Bid[] | undefined;
    private _waits: Bid[] | undefined;
    private _waitsNoOn: Bid[] | undefined;
    private _pending: PendingEventInfo | undefined;
    public get pending() {
        return this._pending;
    }

    private _lastUpdatedOnActionIndex = -1;
    
    public explain(payload?: any): ExplainResult {
        const infos: ExplainResult  = {valid: [], invalid: [], blocked: []};
        this._waits?.forEach(bid => {
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
        this._blocks?.forEach(bid => {
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
        return infos;
    }

    private _dispatch(payload: any): undefined | true | false {    
        const waits = this._waitsNoOn;
        const eventId = this._eventId;
        const guard = getGuardForWaits(waits, eventId);
        if(guard && !isGuardPassed(guard(payload))) return false;
        this._actionDispatch({loopIndex: null, type: ActionType.ui, event: this._eventId, payload: payload, bThreadId: {name: ""}});
        return true;
    }

    public get dispatch() {
        if(!this._waitsNoOn || this._waitsNoOn.length === 0) return undefined;
        return this._dispatch.bind(this);
    }

    constructor(actionDispatch: ActionDispatch, eventId: EventId) {
        this._actionDispatch = actionDispatch;
        this._eventId = eventId;
    }

    public update(allBidsByType: AllBidsByType, pendingEventMap: EventMap<PendingEventInfo>, getCachedItem: GetCachedItem, actionIndex: number) {
        if(this._lastUpdatedOnActionIndex === actionIndex) return;
        this._lastUpdatedOnActionIndex = actionIndex;
        this._blocks = utils.flattenShallow(allBidsByType.block?.getExactMatchAndUnkeyedMatch(this._eventId));
        this._waits = utils.flattenShallow(allBidsByType?.wait?.getAllMatchingValues(this._eventId));
        this._waitsNoOn = this._waits?.filter(bid => bid.subType !== BidSubType.on);
        this._pending = pendingEventMap.get(this._eventId);
        const cachedItem = getCachedItem(this._eventId);
        this._value = cachedItem?.value;
        this._history = cachedItem?.history;
    }
}