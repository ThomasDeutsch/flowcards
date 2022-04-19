import { BufferedQueue } from "./buffered-queue";
import { QueueAction } from "./action";
import { BidType, PlacedBid, PlacedBlockBid } from "./bid";
import { NameKeyId } from "./name-key-map";
import { GetPending, GetPlacedBids } from "staging";
import { explainAskFor, ExplainEventResult, isValidReturn } from "guard";

export type NextValueFn<P> = (current: P | undefined) => P;
type ValidationResultCB<V> = (value: ExplainEventResult<V>) => void;

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

type EventType = 'FIBER' | 'UI';
export class EventCore<P = void, V = string> {
    public readonly type: EventType;
    public readonly name: string;
    public readonly key?: string | number;  //TODO: remove key from EventCore? and only use keys with KeyedEvents ?
    public readonly initialValue?: P;
    private _description?: string;
    private _updatedOn?: number;
    //setup
    protected _addToQueue?: (value: QueueAction) => void;
    private _getPlacedBids?: GetPlacedBids;
    protected _getPending?: GetPending;
    protected _openResolves = new BufferedQueue<ValidationResultCB<V>>();
    // value
    private _value?: P;
    private _initialValue?: P;

    constructor(nameOrNameKey: string | NameKeyId, type: EventType, initialValue?: P) {
        this.type = type;
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

    public describe(description: string): EventCore<P,V> {
        this._description = description;
        return this;
    }

    public get description(): string | undefined {
        return this._description;
    }

    /** @internal */
    public __connect(props: EventConnectProps): void {
        this._openResolves.clear();
        this._value = this._initialValue;
        this._addToQueue = props.addToQueue;
        this._getPlacedBids = props.getPlacedBids;
        this._getPending = props.getPending;
    }

    /** @internal */
    public __queueValidationResult(value: ExplainEventResult<V>): void  {
        const resolveCB = this._openResolves.get;
        resolveCB?.(value);
    }

    public get value(): P | undefined {
        return this._value;
    }

    public get isPending(): boolean {
        return !!(this._getPending?.(this.id).pendingBy)
    }

    public get pendingBy(): NameKeyId | undefined {
        return this._getPending?.(this.id).pendingBy;
    }

    /** @internal */
    public __setValue(nextValue: P): void {
        this._value = nextValue;
    }

    public getBids(bidType: BidType): PlacedBid<P, V>[] | undefined {
        return this._getPlacedBids?.(bidType, this.id);
    }

    public get isConnected(): boolean {
        return this._getPlacedBids !== undefined;
    }

    public get isBlocked(): boolean {
        const bids = this.getBids('blockBid'); //TODO: better typing
        if(bids === undefined) return false;
        return (bids as PlacedBlockBid<P,V>[]).every(bid => bid.guard ? isValidReturn(bid.guard()) : true);
    }

    public get extendedBy(): NameKeyId | undefined {
        return this._getPending?.(this.id).extendedBy;
    }
}

export class EventCoreKeyed<T extends UserEvent<P,V> | FlowEvent<P,V>, P = void, V = string> {
    public readonly type: EventType;
    public readonly name: string;
    private _initialValue?: P;
    private _children = new Map<string | number, T>();

    constructor(name: string, type: EventType, initialValue?: P) {
        this.type = type;
        this._initialValue = initialValue;
        this.name = name;
    }

    public get id(): NameKeyId {
        return { name: this.name }
    }

    public key(key: string | number): T  {
        let event = this._children.get(key);
        if(event === undefined) {
            if(this.type === 'UI') {
                event = new UserEvent<P, V>({name: this.name, key: key}, this._initialValue) as T;
            } else {
                event = new FlowEvent<P, V>({name: this.name, key: key}, this._initialValue) as T;
            }
            this._children.set(key, event);
        }
        return event;
    }

    public keys(...keys: (string | number)[]): T[] {
        return keys.map(key => this.key(key));
    }

    public allKeys(): (string | number)[] {
        return [...this._children].map(([k]) => k);
    }
}


export class UserEvent<P = void, V = string> extends EventCore<P, V> {
    constructor(nameOrNameKey: string | NameKeyId, initialValue?: P) {
        super(nameOrNameKey, 'UI', initialValue);
    }

    private _maybeAddToQueue(action: QueueAction): void {
        if(this._addToQueue === undefined ) {
            throw new Error('event not connected');
        }
        this._addToQueue(action);
    }

    public dispatch(value: P): Promise<ExplainEventResult<V>> {
        const explain = explainAskFor<P, V>(this, value);
        if(explain.isValid) {
            return new Promise<ExplainEventResult<V>>((resolve) => {
                this._maybeAddToQueue!({
                    type: "uiAction",
                    eventId: this.id,
                    payload: value,
                    id: -1,
                    bidId: explain.askForBid!.bidId,
                    flowId: explain.askForBid!.flowId
                });
                this._openResolves.add(resolve);
            });
        }
        return Promise.resolve(explain);
    }

    public explain(value: P): ExplainEventResult<V> {
        return explainAskFor<P, V>(this, value);
    }

    public isValid(value: P): boolean {
        // TODO: cache explain(value) call
        return this.explain(value).isValid === true;
    }
}

export class UserEventKeyed<P = void, V = string> extends EventCoreKeyed<UserEvent<P,V>, P, V> {
    constructor(nameOrNameKey: string, initialValue?: P) {
        super(nameOrNameKey, 'UI', initialValue);
    }
}

export class FlowEvent<P = void, V = string> extends EventCore<P, V> {
    constructor(nameOrNameKey: string | NameKeyId, initialValue?: P) {
        super(nameOrNameKey, 'FIBER', initialValue);
    }
}

export class FlowEventKeyed<P = void, V = string> extends EventCoreKeyed<FlowEvent<P,V>, P, V> {
    constructor(nameOrNameKey: string, initialValue?: P) {
        super(nameOrNameKey, 'FIBER', initialValue);
    }
}
