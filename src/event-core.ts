import { BufferedQueue } from "./buffered-queue";
import { QueueAction } from "./action";
import { BidType, PlacedBid } from "./bid";
import { NameKeyId } from "./name-key-map";
import { GetPending, GetPlacedBids } from "./staging";
import { ExplainEventResult } from "./guard";

export type NextValueFn<P> = (current: P | undefined) => P;
type ValidationResultCB<V> = (value: ExplainEventResult<V>) => void;
type CallbackFunction<P> = (value: P | undefined) => any;

export interface AllBidsForEvent {
    blockBid: PlacedBid[];
    validateBid: PlacedBid[];
    requestBid: PlacedBid[];
    triggerBid: PlacedBid[];
    waitForBid: PlacedBid[];
    askForBid: PlacedBid[];
    extendBid: PlacedBid[];
}

export interface EventConnectProps {
    addToQueue: (action: QueueAction) => void;
    getPlacedBids: GetPlacedBids;
    getPending: GetPending;
}

type EventType = 'Flow' | 'UI';
export class EventCore<P = void, V = string> {
    public readonly type: EventType;
    public readonly name: string;
    public readonly key?: string | number;
    public readonly initialValue?: P;
    private _description?: string;
    private _updatedOn?: number;
    private _updateCallbacks: CallbackFunction<P>[] = [];
    //setup
    protected _addToQueue?: (value: QueueAction) => void;
    private _getPlacedBids?: GetPlacedBids;
    protected _getPending?: GetPending;
    protected _openResolves = new BufferedQueue<ValidationResultCB<V>>();
    // value
    private _value?: P;
    private readonly _initialValue?: P | (() => P);

    private _setValueToInitial(): void {
        this._value = (this._initialValue instanceof Function) ? this._initialValue() : this._initialValue;
    }

    constructor(nameOrNameKey: string | NameKeyId, type: EventType, initialValue?: P | (() => P)) {
        this.type = type;
        this._initialValue = initialValue;
        this._setValueToInitial();
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

    public is(description: string): EventCore<P,V> {
        this._description = description;
        return this;
    }

    public get description(): string | undefined {
        return this._description;
    }

    /** @internal */
    public __connect(props: EventConnectProps): void {
        this._openResolves.clear();
        this._addToQueue = props.addToQueue;
        this._getPlacedBids = props.getPlacedBids;
        this._getPending = props.getPending;
    }

    /** @internal */
    public __disconnect(): void {
        this._openResolves.clear();
        delete this._addToQueue
        delete this._getPlacedBids;
        delete this._getPending;
    }

    /** @internal */
    public __resetValue(): void {
        this._setValueToInitial();
    }

    /** @internal */
    public __queueValidationResult(value: ExplainEventResult<V>): void  {
        const resolveCB = this._openResolves.get;
        resolveCB?.(value);
    }

    public get value(): P | undefined {
        if(!this.isConnected) return undefined;
        return this._value;
    }

    public get isPending(): boolean {
        const pending = this._getPending?.(this.id);
        if(!pending) return false;
        return !!(pending.pendingBy || pending.extendedBy)
    }

    public get pendingBy(): NameKeyId | undefined {
        return this._getPending?.(this.id).pendingBy;
    }

    /** @internal */
    public __setValue(nextValue: P): void {
        this._value = nextValue;
        this._updateCallbacks.forEach(cb => cb(nextValue))
    }

    // TODO: better typing
    public getBids(bidType: BidType): PlacedBid<P, V>[] | undefined {
        return this._getPlacedBids?.(bidType, this.id);
    }

    public get isConnected(): boolean {
        return this._getPlacedBids !== undefined;
    }

    public get isBlocked(): boolean {
        const bids = this.getBids('blockBid'); //TODO: better typing
        return bids !== undefined;
    }

    public get extendedBy(): NameKeyId | undefined {
        return this._getPending?.(this.id).extendedBy;
    }

    public registerCallback(callbackFn: CallbackFunction<P>): void {
        this._updateCallbacks.push(callbackFn);
    }
}

export class EventCoreKeyed<T, P = void> {
    public readonly type: EventType;
    public readonly name: string;
    protected readonly _initialValue?: P | (()=> P);
    protected _children = new Map<string | number, T>();

    constructor(name: string, type: EventType, initialValue?: P | (()=> P)) {
        this.type = type;
        this._initialValue = initialValue;
        this.name = name;
    }

    public get id(): NameKeyId {
        return { name: this.name }
    }

    public allKeys(): (string | number)[] {
        return [...this._children].map(([k]) => k);
    }
}
