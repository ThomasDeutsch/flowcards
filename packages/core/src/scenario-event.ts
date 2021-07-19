import { InternalDispatch, PlacedBid, UIAction } from ".";
import { AllPlacedBids, getHighestPrioAskForBid, PlacedBidContext } from "./bid";
import { EventId } from "./event-map";
import { askForValidationExplainCB, CombinedValidation, CombinedValidationCB, PayloadValidationReturn } from "./validation";

export interface ScenarioEventOptions<P> {
    initialValue?: P;
    key?: number | string;
    description?: string;
    validateCb?: (value: P) => PayloadValidationReturn;
}

export type ValueUpdateCb<P> = (value: P) => P

export class ScenarioEvent<P = void> {
    public readonly name: string;
    public readonly key?: number | string;
    public readonly initialValue?: P;
    public readonly description?: string
    private readonly _ownValidate?: (value: P) => PayloadValidationReturn;
    private _updatedOn?: number;
    private _bidContext?: PlacedBidContext;
    private _askForBid?: PlacedBid;
    private _validateCheck?: CombinedValidationCB<P>;
    private _cancelPendingCb?: (message: string) => boolean;
    private _uiActionCb?: (payload?: P) => void;
    private _value?: P;

    constructor(name: string, options?: ScenarioEventOptions<P>) {
        this.name = name;
        this.key = options?.key;
        this.initialValue = options?.initialValue;
        this._value = options?.initialValue;
        this.description = options?.description;
        this._ownValidate = options?.validateCb
    }

    public get id(): EventId {
        return { name: this.name, key: this.key }
    }

    public get updatedOn(): number | undefined {
        return this._updatedOn;
    }

    public get value(): P | undefined {
        return this._value;
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

    public __update(currentActionId: number, allPlacedBids: AllPlacedBids, cancelPendingCb: (message: string) => boolean): void {
        this._updatedOn = currentActionId;
        this._bidContext = allPlacedBids.get(this.id);
        this._askForBid = getHighestPrioAskForBid(allPlacedBids, this.id);
        this._validateCheck = askForValidationExplainCB(this._askForBid, this._bidContext);
        this._cancelPendingCb = cancelPendingCb;
    }

    public __setValue(v: P): void {
        this._value = v;
    }

    public validate(value?: P): CombinedValidation | undefined {
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


}


