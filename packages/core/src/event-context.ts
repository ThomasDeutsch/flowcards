import { EventId } from './event-map';
import { ActiveBidsByType, BidType, isBlocked, hasValidMatch } from './bid';
import { BThreadId } from './bthread';
import { ActionDispatch } from './update-loop';
import { ActionType } from './action';
import { GetCachedItem, CachedItem } from './event-cache';
import { validate, ValidationResultType } from './validation';

export interface EventInfo {
    bThreadId?: BThreadId;
    event?: EventId;
    type?: BidType;
    details?: any;
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
    private _activeBidsByType: ActiveBidsByType;
    private _dispatchEnabled = false;
    private _isPending = false;
    public get isPending() {
        return this._isPending;
    }

    private _dispatch(payload: any): boolean {  
        if(isBlocked(this._activeBidsByType, this._eventId, {payload: payload})) return false; 
        if(hasValidMatch(this._activeBidsByType, BidType.wait, this._eventId, {payload: payload})) {
            this._actionDispatch({id: null, type: ActionType.ui, eventId: this._eventId, payload: payload, bThreadId: {name: ""}});
            return true;
        }
        return false;
    }

    public validate(payload?: any): ValidationResultType {
        return validate(this._activeBidsByType, this._eventId, payload);
    }

    public get dispatch(): ((payload?: any) => boolean) | undefined {
        if(this._dispatchEnabled) return this._dispatch.bind(this);
        return undefined;
    }

    constructor(actionDispatch: ActionDispatch, eventId: EventId) {
        this._actionDispatch = actionDispatch;
        this._eventId = eventId;
        this._activeBidsByType = {} as ActiveBidsByType;
    }

    public update(activeBidsByType: ActiveBidsByType, getCachedItem: GetCachedItem, actionId: number) {
        if(this._lastUpdatedOnActionId === actionId) return;
        this._lastUpdatedOnActionId = actionId;
        this._activeBidsByType = activeBidsByType;
        this._isPending = activeBidsByType.pending?.has(this._eventId) === true;
        this._cachedItem = getCachedItem(this._eventId);
        this._dispatchEnabled = !isBlocked(this._activeBidsByType, this._eventId) && hasValidMatch(this._activeBidsByType, BidType.wait, this._eventId);
    }
}
