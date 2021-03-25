import { EventId } from './event-map';
import { BidType, isBlocked, hasValidMatch, BidsByType } from './bid';
import { ActionType } from './action';
import { GetCachedEvent } from './event-cache';
import { validate, ValidationResult } from './validation';
import { UIActionDispatch } from './update-loop';


export class EventContext {
    private _uiActionDispatch: UIActionDispatch;
    public readonly eventId: EventId;
    private _getCachedEvent?: GetCachedEvent;
    private _lastUpdatedOnActionId = -1;
    public get value(): any {
        return this._getCachedEvent?.(this.eventId)?.value;
    }
    public get history(): any[] {
        return this._getCachedEvent?.(this.eventId)?.history|| [];
    }
    private _activeBidsByType: BidsByType;
    private _dispatchEnabled = false;
    private _isPending = false;
    public get isPending(): boolean {
        return this._isPending;
    }

    private _dispatch(payload: any): boolean {  
        if(isBlocked(this._activeBidsByType, this.eventId, {payload: payload})) return false; 
        if(hasValidMatch(this._activeBidsByType, BidType.askFor, this.eventId, {payload: payload})) {
            this._uiActionDispatch({type: ActionType.UI, eventId: this.eventId, payload: payload});
            return true;
        }
        return false;
    }

    public validate(payload?: unknown): ValidationResult {
        return validate(this._activeBidsByType, this.eventId, payload);
    }

    public get dispatch(): ((payload?: any) => boolean) | undefined {
        if(this._dispatchEnabled) return this._dispatch;
        return undefined;
    }

    constructor(getCachedEvent: GetCachedEvent, uiActionDispatch: UIActionDispatch, eventId: EventId) {
        this._getCachedEvent = getCachedEvent;
        this._uiActionDispatch = uiActionDispatch;
        this.eventId = eventId;
        this._activeBidsByType = {} as BidsByType;
    }

    public update(activeBidsByType: BidsByType, actionId: number): void {
        if(this._lastUpdatedOnActionId === actionId) return;
        this._lastUpdatedOnActionId = actionId;
        this._activeBidsByType = activeBidsByType;
        this._isPending = activeBidsByType.pending?.has(this.eventId) === true;
        this._dispatchEnabled = !isBlocked(this._activeBidsByType, this.eventId) && hasValidMatch(this._activeBidsByType, BidType.askFor, this.eventId);
    }
}
