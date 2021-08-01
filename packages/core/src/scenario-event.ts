import { PlacedBid } from ".";
import { AllPlacedBids, getHighestPrioAskForBid } from "./bid";
import { NameKeyId } from "./name-key-map";
import { UIActionDispatch } from "./staging";
import { askForValidationExplainCB, CombinedValidation, CombinedValidationCB, explainEventNotEnabled, explainNotAllowedDuringScaffolding } from "./validation";

export type NextValueFn<P> = (current: P | undefined) => P

export class ScenarioEvent<P = void> {
    public readonly name: string;
    public readonly key?: string | number;
    public readonly initialValue?: P;
    public readonly description?: string
    private _updatedOn?: number;
    private _allPlacedBids?: AllPlacedBids;
    private _askForBid?: PlacedBid;
    private _validateCheck: CombinedValidationCB<P>;
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
            this.key = nameOrNameKey.key;
        }
        this._validateCheck = explainEventNotEnabled;
    }

    public get id(): NameKeyId {
        return this.key !== undefined ? { name: this.name, key: this.key } : { name: this.name };
    }

    public get updatedOn(): number | undefined {
        return this._updatedOn;
    }

    public __setup(uiActionDispatch: UIActionDispatch, areBThreadsProgressing: () => boolean): void {
        this._areBThreadsProgressing = areBThreadsProgressing;
        this._uiActionCb = uiActionDispatch;
    }

    public __enable(): void {
        this._isEnabled = true;
        this._validateCheck = explainNotAllowedDuringScaffolding;
    }

    public __update(currentActionId: number, allPlacedBids: AllPlacedBids): void {
        this._updatedOn = currentActionId;
        this._allPlacedBids = allPlacedBids;
        this._askForBid = getHighestPrioAskForBid(allPlacedBids, this.id);
        this._validateCheck = askForValidationExplainCB(this._areBThreadsProgressing!, this._askForBid, allPlacedBids.get(this.id));
    }

    public disable(keepValue?: boolean): void {
        this._isEnabled = false;
        this._validateCheck = explainEventNotEnabled;
        if(!keepValue) {
            this._value = this._initialValue || undefined;
        }
    }

    public get value(): P | undefined {
        return this._value;
    }

    public __setValue(nextValue: P): void {
        this._value = nextValue;
    }

    public validate(value?: P): CombinedValidation {
        return this._validateCheck(value);
    }

    public dispatch(payload: P): boolean {
        if(this.validate(payload).isValid === false) return false;
        this._uiActionCb!(this.id, payload);
        return true;
    }

    public get isPending(): boolean {
        return !!this._allPlacedBids?.get(this.id)?.pendingBy;
    }

    public get isBlocked(): boolean {
        return !!this._allPlacedBids?.get(this.id)?.blockedBy;
    }

    public get isEnabled(): boolean {
        return this._isEnabled;
    }
}

export class ScenarioEventKeyed<P = void> {
    public readonly name: string;
    private _initialValue?: P;
    private _children = new Map<string | number, ScenarioEvent<P>>();

    constructor(name: string, initialValue?: P) {
        this._initialValue = initialValue;
        this.name = name;
    }

    public get id(): NameKeyId {
        return { name: this.name }
    }

    public key(key: string | number): ScenarioEvent<P> {
        let event = this._children.get(key);
        if(event === undefined) {
            event = new ScenarioEvent<P>({name: this.name, key: key}, this._initialValue);
            this._children.set(key, event);
        }
        return event;
    }

    public keys(...keys: (string | number)[]): ScenarioEvent<P>[] {
        return keys.map(key => this.key(key));
    }

    public allKeys(): (string | number)[] {
        return [...this._children].map(([k]) => k);
    }

    public enable(): void {
        [...this._children].forEach(([_, e]) => e.__enable());
    }

    public disable(deleteKeys: boolean): void {
        if(deleteKeys) {
            this._children.clear();
        } else {
            [...this._children].forEach(([_, e]) => e.disable());
        }
    }
}
