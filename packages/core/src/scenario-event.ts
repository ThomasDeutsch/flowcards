import { AllPlacedBids, getHighestPrioAskForBid } from "./bid";
import { NameKeyId } from "./name-key-map";
import { UIActionDispatch } from "./staging";
import { askForValidationExplainCB, CombinedValidationCB, explainDispatchPending, explainEventNotEnabled, ValidationResult, ValidationResults} from "./validation";

export type NextValueFn<P> = (current: P | undefined) => P

export interface EventSetupProps {
    uiActionDispatch: UIActionDispatch;
    getCurrentActionId: () => number;
    getAllPlacedBids: () => AllPlacedBids;
}

export class ScenarioEvent<P = void> {
    public readonly name: string;
    public readonly key?: string | number;
    public readonly initialValue?: P;
    public readonly description?: string
    private _updatedOn?: number;
    private _isEnabled = false;
    //setup
    private _uiActionDispatch?: UIActionDispatch;
    private _getCurrentActionId?: () => number;
    private _getAllPlacedBids?: () => AllPlacedBids;
    // value
    private _value?: P;
    private _initialValue?: P;
    // validation check & placed-bids
    private _explainValue: CombinedValidationCB<P>;
    private _isPending = false;
    private _resolveDispatch?: (result: ValidationResults) => void;

    constructor(nameOrNameKey: string | NameKeyId, initialValue?: P) {
        this._initialValue = initialValue;
        this._value = initialValue;
        if(typeof nameOrNameKey === 'string') {
            this.name = nameOrNameKey;
        } else {
            this.name = nameOrNameKey.name;
            this.key = nameOrNameKey.key;
        }
        this._explainValue = explainEventNotEnabled;
    }

    public get id(): NameKeyId {
        return this.key !== undefined ? { name: this.name, key: this.key } : { name: this.name };
    }

    public get updatedOn(): number | undefined {
        return this._updatedOn;
    }

    /** @internal */
    public __setup(props: EventSetupProps): void {
        this._uiActionDispatch = props.uiActionDispatch;
        this._getCurrentActionId = props.getCurrentActionId;
        this._getAllPlacedBids = props.getAllPlacedBids;
    }

    /** @internal */
    public __enable(): void {
        this._isEnabled = true;
    }

    private _updateEventIfNeeded(): void {
        if(this._getCurrentActionId === undefined || this._getAllPlacedBids === undefined) {
            this._explainValue = explainEventNotEnabled;
            return;
        }
        if(this._getCurrentActionId() === this.updatedOn) return;
        const currentActionId = this._getCurrentActionId();
        const allPlacedBids = this._getAllPlacedBids();
        const bidContext = allPlacedBids?.get(this.id);
        this._isPending = !!bidContext?.pendingBy;
        if(this._isEnabled === false) {
            this._explainValue = explainEventNotEnabled;
        }
        else if(this._updatedOn !== currentActionId) {
            const askForBid = getHighestPrioAskForBid(allPlacedBids, this.id);
            this._explainValue = askForValidationExplainCB(askForBid, bidContext);
        }
        this._updatedOn = currentActionId;
    }

    /** @internal */
    public __disable(keepValue?: boolean): void {
        this.__resolveDispatch?.({passed: [], failed: [{type: 'eventDisabledDuringDispatch'}]});
        this._isEnabled = false;
        if(!keepValue) {
            this._value = this._initialValue || undefined;
        }
    }

    public get value(): P | undefined {
        return this._value;
    }

    /** @internal */
    public __setValue(nextValue: P): void {
        this._value = nextValue;
    }

    public explain(value: P): ValidationResults {
        this._updateEventIfNeeded();
        return this._explainValue(value);
    }

    public isValidDispatch(value: P): boolean {
        this._updateEventIfNeeded();
        return this._explainValue(value).failed.length === 0;
    }

    public dispatch(payload: P): Promise<ValidationResults> {
        if(this._resolveDispatch) return Promise.resolve(explainDispatchPending(payload));
        this._updateEventIfNeeded();
        const validationResults = this._explainValue(payload);
        if(validationResults.failed.length) return Promise.resolve(validationResults);
        const promise = new Promise<ValidationResults>(resolve => {
            this._resolveDispatch = resolve;
        });
        this._uiActionDispatch!(this.id, payload);
        return promise;
    }

    /** @internal */
    public __resolveDispatch(validation: ValidationResults): void {
        this._resolveDispatch?.(validation);
        this._resolveDispatch = undefined;
    }

    public get isPending(): boolean {
        this._updateEventIfNeeded();
        return this._isPending;
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

    /** @internal */
    public __disable(deleteKeys: boolean): void {
        if(deleteKeys) {
            this._children.clear();
        } else {
            [...this._children].forEach(([_, e]) => e.__disable());
        }
    }
}
