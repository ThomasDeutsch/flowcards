import { EventMap, EventId } from './event-map';
import { Bid, BidsByType, BidType, isBlocked } from './bid';
import * as utils from './utils';
import { isGuardPassed } from './guard';
import { PendingEventInfo, BThreadId } from './bthread';
import { ActionDispatch } from './update-loop';
import { ActionType } from './action';
import { GetCachedItem } from './event-cache';

export interface EventInfo {
    bThreadId?: BThreadId;
    event?: EventId;
    type?: BidType;
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
    private _bidsByType: BidsByType;
    private _dispatchableWaits: Bid[] | undefined;
    private _pending: PendingEventInfo | undefined;
    public get pending() {
        return this._pending;
    }

    private _lastUpdatedOnActionId = -1;
    
    public explain(payload?: any): ExplainResult {
        const blocks = utils.flattenShallow(this._bidsByType.block?.getExactMatchAndUnkeyedMatch(this._eventId));
        const waits = utils.flattenShallow(this._bidsByType?.wait?.getAllMatchingValues(this._eventId));
        const infos: ExplainResult  = {valid: [], invalid: []};
        if(!waits || waits.length === 0) {
            infos.invalid.push({details: 'noWait'});
        }
        else {
            waits.forEach(bid => {
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
        }
        // TODO: add pending as invalid?
        blocks.forEach(bid => {
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

    private _dispatch(payload: any): undefined | true | false {    
        const guard = getGuardForWaits(this._dispatchableWaits, this._eventId); //TODO: also get guard from blocks!
        if(guard && !isGuardPassed(guard(payload))) return false;
        this._actionDispatch({id: null, type: ActionType.ui, event: this._eventId, payload: payload, bThreadId: {id: ""}});
        return true;
    }

    public get dispatch(): ActionDispatch | undefined {
        if(!this._dispatchableWaits || this._dispatchableWaits.length === 0) return undefined;
        return this._dispatch.bind(this);
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
        // TODO: get dispatchable waits
        // remove blocks
        // 
        this._dispatchableWaits = this._waits?.filter(bid => bid.subType !== BidSubType.on && !isBlocked(bidsByType, bid.event));
        this._pending = pendingEventMap.get(this._eventId);
        const cachedItem = getCachedItem(this._eventId);
        this._value = cachedItem?.value;
        this._history = cachedItem?.history;
    }
}