import { InputAction, RejectPendingRequestAction, ResolvePendingRequestAction } from "./action.ts";
import { getValidWhenBid, InvalidBidReason } from "./bid-invalid-reasons.ts";
import { WhenBid, CurrentBidsForEvent, Placed } from "./bid.ts";
import { explainValidation } from "./payload-validation.ts";
import { AccumulatedValidationResults } from "./payload-validation.ts";

// TYPES AND INTERFACES -----------------------------------------------------------------------------------------------

interface ConnectToEngineProps {
    rootFlowId: string;
    getCurrentBids: (eventId: string) => CurrentBidsForEvent<any, any> | undefined;
    runEngine: (action?: InputAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction) => void;
    registerEventAccess: (event: Event<any, any>) => void;
    toggleValueAccessLogging: (event: Event<any, any>) => void;
}

export type NestedEventObject = Event<any, any> | EventByKey<any, any> | { [key: string]: NestedEventObject };


// CORE FUNCTIONS -----------------------------------------------------------------------------------------------

export class Event<P = undefined, V = void> {
    public readonly id: string;
    private _value?: P;
    private _hasValue = false;
    private _rootFlowId?: string;
    private _runEngine?: (action?: InputAction<any> | ResolvePendingRequestAction<any> | RejectPendingRequestAction) => void;
    private _getCurrentBids?: (eventId: string) => CurrentBidsForEvent<any, any> | undefined;
    private _onUpdateCallback?: () => void; // only a single subscriber is supported
    private _registerEventAccess?: () => void;
    private _toggleValueAccessLogging?: (event: Event<any, any>) => void;
    private _description?: string;
    private _latestUpdateOnActionId?: number;
    private _relatedValidationEvents = new Map<string, Event<any, any>>();

    constructor(id: string | string, onUpdateCallback?: () => void) {
        this._onUpdateCallback = onUpdateCallback;
        this.id = id;
    }

    public __reset(): void {
        this._rootFlowId = undefined;
        this._runEngine = undefined;
        this._getCurrentBids = undefined;
        this._registerEventAccess = undefined;
        this._toggleValueAccessLogging = undefined;
        this._value = undefined;
        this._latestUpdateOnActionId = undefined;
        this._relatedValidationEvents.clear();
    }

    public __connectToEngine(props: ConnectToEngineProps): void {
        this._rootFlowId = props.rootFlowId;
        this._getCurrentBids = props.getCurrentBids;
        this._runEngine = props.runEngine;
        this._registerEventAccess = () => props.registerEventAccess(this);
        this._toggleValueAccessLogging = props.toggleValueAccessLogging;
    }

    public __setValue(nextValue: P): boolean {
        const hasChanged = !Object.is(this._value, nextValue);
        this._hasValue = true;
        this._value = nextValue;
        return hasChanged;
    }

    public get value(): P | undefined {
        this._registerEventAccess?.();
        if(this._value !== undefined && typeof this._value === 'object') {
            return Object.freeze(this._value);
        }
        return this._value;
    };

    public registerCallback(callback: () => void, sendInitial?: boolean): void {
        this._onUpdateCallback = callback;
        if(sendInitial) callback();
    }

    public validate(value: P): {invalidBidReason?: InvalidBidReason, accumulatedValidationResults?: AccumulatedValidationResults<V>, whenBid?: Placed<WhenBid<P, V>>} {
        const currentBids = this._getCurrentBids?.(this.id);
        const {whenBid, invalidBidReason} = getValidWhenBid(this.id, currentBids);
        if(invalidBidReason) return {invalidBidReason};
        if(currentBids === undefined || whenBid === undefined) throw new Error('unexpected error: after bid validation, the current bids or the when-bid should not be undefined');
        this._toggleValueAccessLogging?.(this);
        const accumulatedValidationResults = explainValidation(currentBids, value, [whenBid]);
        this._toggleValueAccessLogging?.(this);
        return {accumulatedValidationResults, whenBid};
    }

    public isValid(value: P): boolean {
        const {accumulatedValidationResults} = this.validate(value);
        return accumulatedValidationResults?.isValidAccumulated || false;
    }

    public dispatch(value: P): void {
        const {invalidBidReason, accumulatedValidationResults, whenBid} = this.validate(value as P);
        if(invalidBidReason || whenBid === undefined) {
            console.error('invalid bid: %O', invalidBidReason);
            throw new Error('event can not be dispatched because of an invalid bid');
        }
        else if(accumulatedValidationResults?.isValidAccumulated === false) {
            console.error('payload validation falied: %O', accumulatedValidationResults);
            throw new Error('event can not be dispatched because of an invalid payload');
        }
        const action: InputAction<P> = {
            type: "input",
            payload: value as P,
            id: null,
            eventId: this.id,
            flowPath: whenBid.flow.path,
            bidId: whenBid.id
        };
        if(this._runEngine === undefined) throw new Error('unexpected error: runEngine is undefined');
        this._runEngine(action);
    }

    public __triggerUpdateCallback(actionId: number): void {
        if(this._latestUpdateOnActionId === actionId) return;
        this._latestUpdateOnActionId = actionId;
        this._onUpdateCallback?.();
        this._relatedValidationEvents.forEach((event) => event.__triggerUpdateCallback(actionId));
        this._relatedValidationEvents.clear();
    }

    public __addRelatedValidationEvent(event: Event<P, V>): void {
        if(event == this) return;
        this._relatedValidationEvents.set(event.id, event);
    }

    public get hasActiveWhen(): boolean {
        this._registerEventAccess?.();
        return this._getCurrentBids?.(this.id)?.when?.[0] !== undefined;
    }

    public get isPending(): boolean {
        this._registerEventAccess?.();
        const pendingRequest = this._getCurrentBids?.(this.id)?.pendingRequest !== undefined;
        const pendingExtend = this._getCurrentBids?.(this.id)?.pendingExtend !== undefined;
        return pendingRequest || pendingExtend;
    }

    public get extendedValue(): P | Promise<P> | undefined {
        this._registerEventAccess?.();
        return this._getCurrentBids?.(this.id)?.pendingExtend?.value;
    }

    public setDescription(description: string): this {
        this._description = description;
        return this;
    }

    public get description(): string | undefined {
        return this._description;
    }

    public get rootFlowId(): string | undefined {
        return this._rootFlowId;
    }

    public reset(): this {
        this._hasValue = false;
        this._value = undefined;
        return this;
    }

    public get hasValue(): boolean {
        return this._hasValue;
    }
}


export class EventByKey<P = void, V = void> {
    public readonly name: string | number;
    protected _children = new Map<string | number, Event<P,V>>();

    constructor(name: string) {
        this.name = name;
    }

    public getEvent(key: string | number): Event<P,V> {
        let event = this._children.get(key);
        if(event === undefined) {
            const id: string = `${this.name}__key:${key}`;
            event = new Event<P, V>(id);
            this._children.set(key, event);
        }
        return event;
    }

    public getEvents(...keys: (string | number)[]): Event<P,V>[] {
        return keys.map(key => this.getEvent(key));
    }

    public allKeys(): (string | number)[] {
        return [...this._children].map(([key]) => key);
    }

    public get allEvents(): Event<P,V>[] {
        return [...this._children].map(([_, e]) => e);
    }

    public removeEvent(key: string): boolean {
        return this._children.delete(key);
    }
}


// HELPERS -------------------------------------------------------------------------------------------------------------

export function getEvents(neo: NestedEventObject): Event<any, any>[] {
    if(neo instanceof Event) return [neo];
    if(neo instanceof EventByKey) return neo.allEvents;
    return Object.values(neo).map(x => getEvents(x)).flat();
}