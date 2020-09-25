import { EventMap, EventId } from './event-map';
import { Bid, BidSubType, AllBidsByType, BidType } from './bid';
import * as utils from './utils';
import { isGuardPassed, getGuardForWaits } from './guard';
import { PendingEventInfo, BThreadId } from './bthread';
import { ActionDispatch } from './update-loop';
import { ActionType } from './action';
import { GetCachedItem } from './event-cache';

export interface EventInfo {
    bThreadId?: BThreadId;
    event?: EventId;
    type?: BidType;
    subType?: BidSubType;
    details?: any;
}

function getResultDetails(result: boolean | { isValid: boolean; details?: string | undefined }): any {
    return (typeof result !== 'boolean') ? result.details : undefined;
}

export type ExplainResult = {
    valid: EventInfo[]; 
    invalid: EventInfo[];
}

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

    private _lastUpdatedOnActionId = -1;
    
    public explain(payload?: any): ExplainResult {
        const infos: ExplainResult  = {valid: [], invalid: []};
        if(!this._waits || this._waits.length === 0) {
            infos.invalid.push({details: 'noWait'});
        }
        else {
            this._waits.forEach(bid => {
                const guardResult = bid.guard?.(payload);
                if(bid.event.name === 'nyWaitBid1') {
                    console.log('TEST!: ', guardResult, bid)
                }
                if(guardResult === undefined) {
  
                    infos.valid.push({
                        bThreadId: bid.bThreadId,
                        event: bid.event,
                        type: bid.type,
                        subType: bid.subType
                    });
                    return;
                }
                const isValid = isGuardPassed(guardResult);
                const result = {
                    bThreadId: bid.bThreadId,
                    event: bid.event,
                    type: bid.type,
                    subType: bid.subType,
                    details: getResultDetails(guardResult),
                }
                if(isValid) {
                    infos.valid.push(result);
                } 
                else {
                    infos.invalid.push(result);
                }
            });
        }
        this._blocks?.forEach(bid => {
            const guardResult = bid.guard?.(payload);
            if(guardResult === undefined) {
                infos.invalid.push({
                    bThreadId: bid.bThreadId,
                    event: bid.event,
                    type: bid.type,
                    subType: bid.subType,
                    details: 'blocked'
                });
                return;
            }
            const isValid = isGuardPassed(guardResult);
            const info = {
                bThreadId: bid.bThreadId,
                event: bid.event,
                type: bid.type,
                subType: bid.subType,
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

    private _dispatch(payload: any): undefined | true | false {    
        const waits = this._waitsNoOn;
        const eventId = this._eventId;
        const guard = getGuardForWaits(waits, eventId);
        if(guard && !isGuardPassed(guard(payload))) return false;
        this._actionDispatch({id: null, type: ActionType.ui, event: this._eventId, payload: payload, bThreadId: {id: ""}});
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

    public update(allBidsByType: AllBidsByType, pendingEventMap: EventMap<PendingEventInfo>, getCachedItem: GetCachedItem, actionId: number) {
        if(this._lastUpdatedOnActionId === actionId) return;
        this._lastUpdatedOnActionId = actionId;
        this._blocks = utils.flattenShallow(allBidsByType.block?.getExactMatchAndUnkeyedMatch(this._eventId));
        this._waits = utils.flattenShallow(allBidsByType?.wait?.getAllMatchingValues(this._eventId));
        this._waitsNoOn = this._waits?.filter(bid => bid.subType !== BidSubType.on);
        this._pending = pendingEventMap.get(this._eventId);
        const cachedItem = getCachedItem(this._eventId);
        this._value = cachedItem?.value;
        this._history = cachedItem?.history;
    }
}