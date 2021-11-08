import { getHighestPrioAskForBid, PlacedBid } from ".";
import { NameKeyId } from "./name-key-map";
import { UIActionDispatch } from "./staging";
import { getAllPayloadValidationCallbacks, PayloadValidationCB, validateAll, ValidationResults} from "./validation";


export type NextValueFn<P> = (current: P | undefined) => P;


export interface EventBidInfo {
    blockedBy?: NameKeyId[];
    pendingBy?: NameKeyId;
    validateBids?: PlacedBid[]
    waitingBids?: PlacedBid[]
}


export interface EventConnectProps {
    uiActionDispatch: UIActionDispatch;
    getEventBidInfo: (eventId: NameKeyId) => EventBidInfo;
}


export class BEvent<P = void, V = string> {
    public readonly name: string;
    public readonly key?: string | number;
    public readonly initialValue?: P;
    public readonly description?: string;
    private _updatedOn?: number;
    //setup
    private _uiActionDispatch?: UIActionDispatch;
    private _getEventBidInfo?: (eventId: NameKeyId) => EventBidInfo;
    // value
    private _value?: P;
    private _initialValue?: P;

    constructor(nameOrNameKey: string | NameKeyId, initialValue?: P) {
        this._initialValue = initialValue;
        this._value = initialValue;
        if(typeof nameOrNameKey === 'string') {
            this.name = nameOrNameKey;
        } else {
            this.name = nameOrNameKey.name;
            this.key = nameOrNameKey.key;
        }
    }

    public get id(): NameKeyId {
        return this.key !== undefined ? { name: this.name, key: this.key } : { name: this.name };
    }

    public get updatedOn(): number | undefined {
        return this._updatedOn;
    }

    /** @internal */
    public __connect(props: EventConnectProps): void {
        this._uiActionDispatch = props.uiActionDispatch;
        this._getEventBidInfo = props.getEventBidInfo;
    }

    /** @internal */
    public __unplug(): void {
        delete this._uiActionDispatch;
        delete this._getEventBidInfo;
        this._value = this._initialValue || undefined;
    }

    public get value(): P | undefined {
        return this._value;
    }

    /** @internal */
    public __setValue(nextValue: P): void {
        this._value = nextValue;
    }

    public get bidInfo(): EventBidInfo | undefined {
        return this._getEventBidInfo?.(this.id);
    }

    private _getAskForBidAndValidationCallbacks(): undefined | [PlacedBid<P>, PayloadValidationCB<P, V>[]]  {
        const bidInfo = this.bidInfo;
        if(bidInfo === undefined) return undefined;
        const askForBid = getHighestPrioAskForBid<P>(bidInfo.waitingBids);
        if(askForBid === undefined) return undefined;
        const validationCallbacks = getAllPayloadValidationCallbacks<P, V>(askForBid, bidInfo.validateBids);
        return [askForBid, validationCallbacks];
    }

    public validate(value: P): ValidationResults<V> {
        const bidInfo = this.bidInfo;
        if(bidInfo === undefined) return { isValid: false, passed: [], failed: [] }
        if(bidInfo.pendingBy !== undefined || this.isConnected === false  || bidInfo.blockedBy !== undefined) return { isValid: false, passed: [], failed: []  };
        const av = this._getAskForBidAndValidationCallbacks();
        if(av === undefined) return {isValid: false, passed: [], failed: [] };
        return validateAll<P, V>(av[1], value);
    }

    public isValid(value: P): boolean {
        return this.validate(value).isValid === true;
    }

    public get isConnected(): boolean {
        return this._uiActionDispatch !== undefined;
    }

    public get isPending(): boolean {
        return this.bidInfo?.pendingBy !== undefined;
    }

    public get isBlocked(): boolean {
        return this.bidInfo?.blockedBy !== undefined;
    }

    public dispatch(value: P): boolean {
        const av = this._getAskForBidAndValidationCallbacks();
        if(av === undefined) return false;
        const [askForBid, validationCallbacks] = av;
        if(validateAll(validationCallbacks, value).isValid === false) return false;
        this._uiActionDispatch!(askForBid.bThreadId, askForBid.eventId, value)
        return true;
    }
}


export class BEventKeyed<P = void> {
    public readonly name: string;
    private _initialValue?: P;
    private _children = new Map<string | number, BEvent<P>>();

    constructor(name: string, initialValue?: P) {
        this._initialValue = initialValue;
        this.name = name;
    }

    public get id(): NameKeyId {
        return { name: this.name }
    }

    public key(key: string | number): BEvent<P> {
        let event = this._children.get(key);
        if(event === undefined) {
            event = new BEvent<P>({name: this.name, key: key}, this._initialValue);
            this._children.set(key, event);
        }
        return event;
    }

    public keys(...keys: (string | number)[]): BEvent<P>[] {
        return keys.map(key => this.key(key));
    }

    public allKeys(): (string | number)[] {
        return [...this._children].map(([k]) => k);
    }

    /** @internal */
    public __unplug(deleteKeys: boolean): void {
        if(deleteKeys) {
            this._children.clear();
        } else {
            [...this._children].forEach(([_, e]) => e.__unplug());
        }
    }
}
