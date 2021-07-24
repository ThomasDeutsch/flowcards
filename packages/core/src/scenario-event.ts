import { InternalDispatch, PlacedBid, UIAction } from ".";
import { AllPlacedBids, getHighestPrioAskForBid, PlacedBidContext } from "./bid";
import { NameKeyId, Key } from "./name-key-map";
import { askForValidationExplainCB, CombinedValidation, CombinedValidationCB } from "./validation";

export type ValueUpdateCb<P> = (value: P) => P;

export interface EventIdWithValue<P> extends NameKeyId {
    value?: P;
}

export class ScenarioEvent<P = void> {
    public readonly name: string;
    public readonly initialValue?: P;
    public readonly description?: string
    private _updatedOn?: number;
    private _bidContext?: PlacedBidContext;
    private _askForBid?: PlacedBid;
    private _validateCheck: CombinedValidationCB<P> = askForValidationExplainCB();
    private _cancelPendingCb?: (message: string) => boolean;
    private _uiActionCb?: (payload?: P) => void;
    private _isEnabled = false;
    private _value?: P;
    private _valueByKey = new Map<Key, P>();

    constructor(name: string, initialValue?: P) {
        this._value = initialValue;
        this.name = name;
    }

    public get id(): NameKeyId {
        return { name: this.name }
    }

    public get updatedOn(): number | undefined {
        return this._updatedOn;
    }
    public key(key: Key): EventIdWithValue<P> {
        return { name: this.name, key: key, value: this._valueByKey.get(key) }
    }

    public __setUIActionCb(internalDispatch: InternalDispatch): void {
        this._uiActionCb = (payload?: P) => {
            const uiAction: UIAction = {
                type: "uiAction",
                eventId: this.id,
                payload: payload
            }
            internalDispatch(uiAction);
        }
    }

    public setIsEnabled(isEnabled: boolean): void {
        this._isEnabled = isEnabled;
    }

    public __update(currentActionId: number, allPlacedBids: AllPlacedBids, cancelPendingCb?: (message: string) => boolean): void {
        this._updatedOn = currentActionId;
        this._bidContext = allPlacedBids.get(this.id);
        this._askForBid = getHighestPrioAskForBid(allPlacedBids, this.id);
        this._validateCheck = askForValidationExplainCB(this._askForBid, this._bidContext);
        this._cancelPendingCb = cancelPendingCb;
    }

    public get value(): P | undefined {
        return this._value;
    }

    public __setValue(nextValue: P, key?: Key): void {
        if(key !== undefined) {
            this._valueByKey.set(key, nextValue);
            return;
        }
        this._value = nextValue;
    }

    public validate(value?: P): CombinedValidation {
        return this._validateCheck?.(value);
    }

    public dispatch(payload: P): boolean {
        if(!this._askForBid) return false;
        if(this._bidContext?.pendingBy || this._bidContext?.blockedBy) return false;
        if(!this.validate(payload)?.isValid) return false;
        this._uiActionCb?.(payload);
        return true;
    }

    public get isPending(): boolean {
        return !!this._cancelPendingCb;
    }

    public cancelPending(message: string): boolean {
        return this._cancelPendingCb?.(message) || false;
    }

    public get isBlocked(): boolean {
        return !!this._bidContext?.blockedBy;
    }

    public get isEnabled(): boolean {
        return this._isEnabled;
    }
}


