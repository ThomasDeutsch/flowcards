import { EventMap, EventId } from './event-map';
import { BidsByType, BidType, isBlocked, hasValidMatch } from './bid';
import { PendingEventInfo, BThreadId } from './bthread';
import { ActionDispatch } from './update-loop';
import { ActionType } from './action';
import { GetCachedItem, CachedItem } from './event-cache';
import { validate } from './validation';

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
    private _bidsByType: BidsByType;
    private _dispatchEnabled = false;
    private _pending: PendingEventInfo | undefined;
    public get pending() {
        return this._pending;
    }

    private _dispatch(payload: any): boolean {  
        if(isBlocked(this._bidsByType, this._eventId, {payload: payload})) return false; 
        if(hasValidMatch(this._bidsByType, BidType.wait, this._eventId, {payload: payload})) {
            this._actionDispatch({id: null, type: ActionType.ui, event: this._eventId, payload: payload, bThreadId: {id: ""}});
            return true;
        }
        return false;
    }

    public validate(payload: any) {
        validate(this._bidsByType, this._eventId, payload);
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