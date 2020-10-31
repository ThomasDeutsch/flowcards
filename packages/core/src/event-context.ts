import { EventId } from './event-map';
import { BidType, isBlocked, hasValidMatch, BidsByType } from './bid';
import { BThreadId } from './bthread';
import { ActionType } from './action';
import { GetCachedItem, CachedItem } from './event-cache';
import { validate, ValidationResult } from './validation';
import { ActionDispatch } from './scaffolding';

export interface EventInfo {
    bThreadId?: BThreadId;
    event?: EventId;
    type?: BidType;
    details?: any;
}

export class EventContext {
    private _actionDispatch: ActionDispatch;
    public readonly eventId: EventId;
    private _cachedItem?: CachedItem<any>;
    private _lastUpdatedOnActionId = -1;
    public get value() {
        return this._cachedItem?.value;
    }
    public get history() {
        return this._cachedItem?.history|| [];
    }
    private _activeBidsByType: BidsByType;
    private _dispatchEnabled = false;
    private _isPending = false;
    public get isPending() {
        return this._isPending;
    }

    private _dispatch(payload: any): boolean {  
        if(isBlocked(this._activeBidsByType, this.eventId, {payload: payload})) return false; 
        if(hasValidMatch(this._activeBidsByType, BidType.wait, this.eventId, {payload: payload})) {
            this._actionDispatch({id: null, type: ActionType.ui, eventId: this.eventId, payload: payload, bThreadId: {name: ""}});
            return true;
        }
        return false;
    }

    public validate(payload?: any): ValidationResult {
        return validate(this._activeBidsByType, this.eventId, payload);
    }

    public get dispatch(): ((payload?: any) => boolean) | undefined {
        if(this._dispatchEnabled) return this._dispatch.bind(this);
        return undefined;
    }

    constructor(actionDispatch: ActionDispatch, eventId: EventId) {
        this._actionDispatch = actionDispatch;
        this.eventId = eventId;
        this._activeBidsByType = {} as BidsByType;
    }

    public update(activeBidsByType: BidsByType, getCachedItem: GetCachedItem, actionId: number) {
        if(this._lastUpdatedOnActionId === actionId) return;
        this._lastUpdatedOnActionId = actionId;
        this._activeBidsByType = activeBidsByType;
        this._isPending = activeBidsByType.pending?.has(this.eventId) === true;
        this._cachedItem = getCachedItem(this.eventId);
        this._dispatchEnabled = !isBlocked(this._activeBidsByType, this.eventId) && hasValidMatch(this._activeBidsByType, BidType.wait, this.eventId);
    }
}
