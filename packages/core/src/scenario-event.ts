import { PlacedBid } from ".";
import { AllPlacedBids, getHighestPrioAskForBid, PlacedBidContext } from "./bid";
import { NameKeyId } from "./name-key-map";
import { UIActionDispatch } from "./scaffolding";
import { askForValidationExplainCB, CombinedValidation, CombinedValidationCB } from "./validation";

export type ValueUpdateCb<P> = (value: P) => P;

export interface EventIdWithValue<P> extends NameKeyId {
    value?: P;
}

export class ScenarioEvent<P = void> {
    public readonly name: string;
    public readonly key?: string;
    public readonly initialValue?: P;
    public readonly description?: string
    private _updatedOn?: number;
    private _bidContext?: PlacedBidContext;
    private _askForBid?: PlacedBid;
    private _validateCheck?: CombinedValidationCB<P>;
    private _cancelPendingCb?: (message: string) => boolean;
    private _uiActionCb?: UIActionDispatch;
    private _isEnabled = false;
    private _value?: P;
    private _initialValue?: P;
    private _areBThreadsProgressing?: () => boolean;

    constructor(nameOrNameKey: string | NameKeyId, initialValue?: P) {
        this._initialValue = initialValue;
        this._value = initialValue;
        if(typeof nameOrNameKey === 'string') {
            this.name = nameOrNameKey;
        } else {
            this.name = nameOrNameKey.name;
            this.key = nameOrNameKey.key?.toString();
        }

    }

    public get id(): NameKeyId {
        return this.key ? { name: this.name, key: this.key } : { name: this.name };
    }

    public get updatedOn(): number | undefined {
        return this._updatedOn;
    }

    public __setUIActionCb(uiActionDispatch: UIActionDispatch, areBThreadsProgressing: () => boolean): void {
        this._areBThreadsProgressing = areBThreadsProgressing.bind(this);
        this._uiActionCb = uiActionDispatch;
    }

    public disable(resetValue = false): void {
        this._isEnabled = false;
        if(resetValue) {
            this._value = this._initialValue || undefined;
        }
    }

    public enable(): void {
        this._isEnabled = true;
    }

    public __update(currentActionId: number, allPlacedBids: AllPlacedBids, cancelPendingCb?: (message: string) => boolean): void {
        this._updatedOn = currentActionId;
        this._bidContext = allPlacedBids.get(this.id);
        this._askForBid = getHighestPrioAskForBid(allPlacedBids, this.id);
        this._validateCheck = askForValidationExplainCB(this._areBThreadsProgressing!, this._askForBid, this._bidContext);
        this._cancelPendingCb = cancelPendingCb;
    }

    public get value(): P | undefined {
        return this._value;
    }

    public __setValue(nextValue: P): void {
        this._value = nextValue;
    }

    public validate(value?: P): CombinedValidation {
        return this._validateCheck!(value);
    }

    public dispatch(payload: P): boolean {
        if(this.validate(payload).isValid === false) return false;
        this._uiActionCb!(this.id, payload);
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

export class ScenarioEventKeyed<P = void> {
    public readonly name: string;
    private _initialValue?: P;
    private _eventByKey: Record<string, ScenarioEvent<P>> = {};

    constructor(name: string, initialValue?: P) {
        this._initialValue = initialValue;
        this.name = name;
    }

    public get id(): NameKeyId {
        return { name: this.name }
    }

    public key(k: string | number): ScenarioEvent<P> {
        const key = k.toString();
        let event = this._eventByKey[key];
        if(event === undefined) {
            event = this._eventByKey[key] = new ScenarioEvent<P>({name: this.name, key: key}, this._initialValue);
        }
        return event;
    }

    public keys(...keys: (string | number)[]): ScenarioEvent<P>[] {
        return keys.map(key => this.key(key.toString()));
    }

    public allKeys(): string[] {
        return Object.entries(this._eventByKey).map(([k]) => k);
    }

    public enable(): void {
        Object.entries(this._eventByKey).forEach(([_, e]) => e.enable());
    }

    public disable(onDisable?: 'resetValues' | 'resetKeys'): void {
        if(onDisable == 'resetValues') {
            Object.entries(this._eventByKey).forEach(([_, e]) => e.disable(true));
        } else if(onDisable === "resetKeys") {
            this._eventByKey = {}
        } else {
            Object.entries(this._eventByKey).forEach(([_, e]) => e.disable());
        }
    }
}
