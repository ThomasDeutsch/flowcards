import { ActionType, BidType, GetBids, InternalDispatch, isSameNameKeyId, PlacedBid, RejectAction, RequestedAsyncAction, ResolveAction, ResolveExtendAction } from ".";
import { NameKeyId } from "./name-key-map";
import { validateDispatch, ValidationResults} from "./validation";


export type NextValueFn<P> = (current: P | undefined) => P;


export interface AllBidsForEvent {
    blockBid: PlacedBid[];
    validateBid: PlacedBid[];
    requestBid: PlacedBid[];
    triggerBid: PlacedBid[];
    waitForBid: PlacedBid[];
    askForBid: PlacedBid[];
    extendBid: PlacedBid[];
    catchErrorBid: PlacedBid[];
}

export interface EventConnectProps {
    internalDispatch: InternalDispatch;
    getBids: GetBids;
}

interface PendingExtend<P> {
    bid: PlacedBid<P>;
    extendedValue: P;
    bThreadId: NameKeyId;
    extendedBy: NameKeyId;
    resolve: (value: P | PromiseLike<P>) => void
    reject: (reason?: any) => void
}

interface PendingRequestInfo {
    actionId: number,
    bThreadId: NameKeyId
}

export class BEvent<P = void, V = string> {
    public readonly name: string;
    public readonly key?: string | number;
    public readonly initialValue?: P;
    public readonly description?: string;
    private _updatedOn?: number;
    private _pendingExtend?: PendingExtend<P>;
    private _pendingRequestInfo?: PendingRequestInfo;
    //setup
    private _internalDispatch?: InternalDispatch;
    private _getBids?: GetBids;
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
        this._internalDispatch = props.internalDispatch;
        this._getBids = props.getBids;
    }

    /** @internal */
    public __unplug(): void {
        delete this._internalDispatch;
        delete this._getBids;
        delete this._pendingRequestInfo;
        delete this._pendingExtend;
        this._value = this._initialValue || undefined;
    }

    /** @internal */
    public __dispatchOnPromiseResolve(action: RequestedAsyncAction): void {
        this._pendingRequestInfo = {
            actionId: action.id,
            bThreadId: action.bThreadId
        }
        const promise = action.payload as Promise<P>;
        promise.then(value => {
            if(this._pendingRequestInfo?.actionId === action.id) {
                const dispatchAction: ResolveAction = {
                    type: "resolveAction",
                    eventId: this.id,
                    payload: value,
                    bThreadId: action.bThreadId,
                    requestActionId: action.id,
                    id: -1
                }
                this._internalDispatch?.(dispatchAction);
            }
        }).catch(error => {
            if(this._pendingRequestInfo?.actionId === action.id) {
                const dispatchAction: RejectAction = {
                    type: "rejectAction",
                    eventId: this.id,
                    bThreadId: action.bThreadId,
                    payload: undefined,
                    error: error,
                    requestActionId: action.id,
                    id: -1
                }
                this._internalDispatch?.(dispatchAction);
            }
        });
    }

    /** @internal */
    public __cancelPending(): boolean {
        if(this._pendingRequestInfo === undefined) return false;
        delete this._pendingRequestInfo;
        return true;
    }

    /** @internal */
    public __removePending(): void {
        delete this._pendingExtend;
        delete this._pendingRequestInfo;
    }

    /** @internal */
    public __isExtending(bThreadId: NameKeyId): boolean {
        if(this._pendingExtend === undefined) return false;
        return isSameNameKeyId(this._pendingExtend.extendedBy, bThreadId);
    }

    /** @internal */
    public __addPendingExtend(placedBid: PlacedBid<P>, extendedValue: P, extendedActionType: ActionType, bThreadId: NameKeyId, extendedBy: NameKeyId): void {
        new Promise<P>((resolve, reject) => {
            this._pendingExtend = {
                bid: placedBid,
                bThreadId,
                extendedBy,
                extendedValue,
                resolve,
                reject
            }
        }).then(value => {
            const action: ResolveExtendAction = {
                type: "resolvedExtendAction",
                bThreadId,
                eventId: this.id,
                extendedActionType,
                payload: value,
                id: -1
            }
            this._internalDispatch?.(action);
        });
    }

    /** @internal */
    public __resolveExtend(bThreadId: NameKeyId, value: P): boolean {
        if(this._pendingExtend === undefined) return false;
        if(!isSameNameKeyId(bThreadId, this._pendingExtend.extendedBy)) return false;
        this._pendingExtend?.resolve(value);
        return true;
    }

    /** @internal */
    public __getExtendValue(bThreadId: NameKeyId): P | undefined {
        if(this._pendingExtend && this._pendingExtend.extendedBy === bThreadId) return this._pendingExtend.extendedValue;
        return undefined;
    }

    public get value(): P | undefined {
        return this._value;
    }

    /** @internal */
    public __setValue(nextValue: P): void {
        this._value = nextValue;
    }

    public getBids(bidType: BidType): PlacedBid<P>[] | undefined {
        return this._getBids?.(this.id, bidType);
    }

    private _getValidationResultAndAskForBid(value: P): ValidationResults<P,V> {
        return validateDispatch<P, V>(value, this);
    }

    public validate(value: P): ValidationResults<P, V> {
        return this._getValidationResultAndAskForBid(value);
    }

    public isValid(value: P): boolean {
        return this.validate(value).isValid === true;
    }

    public get isConnected(): boolean {
        return this._internalDispatch !== undefined;
    }

    public get isPending(): boolean {
        return this._pendingRequestInfo !== undefined || this._pendingExtend !== undefined;
    }

    public get pendingRequestInfo(): PendingRequestInfo | undefined {
        return this._pendingRequestInfo;
    }

    public get isBlocked(): boolean {
        return this.getBids('blockBid') !== undefined;
    }

    public dispatch(value: P): Promise<ValidationResults<P, V>> {
        const result = this._getValidationResultAndAskForBid(value);
        if(result.isValid) {
            return new Promise<ValidationResults<P, V>>((resolve) => {
                this._internalDispatch!({
                    type: "uiAction",
                    eventId: this.id,
                    bThreadId: result.selectedBids![0].bThreadId,
                    payload: value,
                    dispatchResultCB: resolve,
                    id: -1
                });
            });
        }
        return Promise.resolve(result);
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


export class BUIEvent<P = void, V = string> extends BEvent<P, V> {
    constructor(nameOrNameKey: string | NameKeyId, initialValue?: P) {
        super(nameOrNameKey, initialValue);
    }
}
