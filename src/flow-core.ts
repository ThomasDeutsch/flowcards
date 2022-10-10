import { PlacedBid, BidOrBids } from './bid';
import { isSameNameKeyId, NameKeyId, NameKeyMap } from './name-key-map';
import { Logger } from './logger';
import { EventCore } from './event-core';
import { FlowGeneratorFunction } from './flow';
import { ActionType, QueueAction, RejectAction, RequestedAsyncAction, ResolveAction, ResolveExtendAction } from './action';
import { toArray } from './utils';

export type ErrorInfo = {event: NameKeyId, error: any}
export type FlowGenerator = Generator<BidOrBids, void, FlowProgressInfo>;

export interface FlowUtilities {
    key?: string | number;
    resolveExtend: <T,V>(event: EventCore<T,V>, value: T) => boolean;
    abortExtend:  <T,V>(event: EventCore<T,V>) => void;
    isExtending:  <T,V>(event: EventCore<T,V>) => boolean;
    getExtendValue: <T, V>(event: EventCore<T, V>) => T | undefined;
}
export interface FlowProgressInfo {
    event: EventCore<any, any>;
    eventId: NameKeyId;
    flowId: NameKeyId;
    extend?: {value: any};
    remainingBids?: PlacedBid<any>[];
}

export interface FlowProps {
    id: NameKeyId,
    generatorFunction: FlowGeneratorFunction;
    logger: Logger;
    addToQueue: (action: QueueAction) => void;
    cancelPending: (flowId: NameKeyId, eventId: NameKeyId) => void;
}

export interface ExtendContext {
    extendedActionType: ActionType;
    extendedFlowId: NameKeyId,
    extendedBidId: number,
    value: any;
    event: EventCore<any, any>;
}

export interface Pending {
    pendingExtends: NameKeyMap<{by: NameKeyId}>;
    pendingRequests: NameKeyMap<{by: NameKeyId}>;
}

export class FlowCore {
    public readonly id: NameKeyId;
    private readonly _logger: Logger;
    private _thread: FlowGenerator;
    private _placedBids: PlacedBid[] | undefined;
    private _context: FlowUtilities;
    private _pendingExtends = new NameKeyMap<ExtendContext>();
    private _pendingRequests = new NameKeyMap<RequestedAsyncAction>();
    private _addToQueue: (action: QueueAction) => void;
    private _generatorFunction: FlowGeneratorFunction;
    private _cancelPending: (flowId: NameKeyId, eventId: NameKeyId) => void;
    private _currentBidPlacementId = 0;
    private _inInitialState = true;

    public constructor(params: FlowProps) {
        this.id = params.id;
        this._logger = params.logger;
        this._context = this._createFlowUtilities();
        this._generatorFunction = params.generatorFunction;
        this._thread = params.generatorFunction.bind(this._context)();
        const next = this._thread.next();
        this._setPlacedBids(next);
        this._addToQueue = params.addToQueue;
        this._cancelPending = params.cancelPending;
    }

     // --- private
    private _createFlowUtilities(): FlowUtilities {
        return {
            key:  this.id.key,
            resolveExtend: (event, value) => {
                const context = this._pendingExtends.get(event.id);
                if(context === undefined) {
                    console.warn('resolve extend not possible for ', event.id);
                    return false;
                }
                const resolveExtendAction: ResolveExtendAction = {
                    type: "resolvedExtendAction",
                    flowId: context.extendedFlowId,
                    bidId: context.extendedBidId,
                    eventId: event.id,
                    extendedActionType: context.extendedActionType,
                    payload: value,
                    extendedBy: this.id,
                    id: -1,
                }
                this._addToQueue(resolveExtendAction);
                return true;
            },
            abortExtend: (event) => {
                this._pendingExtends.delete(event.id);
            },
            isExtending: (event) => this._pendingExtends.has(event.id),
            getExtendValue: (event) => this._pendingExtends.get(event.id)?.value
        }
    }

    public reset(): void {
        // do not reset flow if it is in inital state
        if(this._inInitialState) return;
        this.cancelAllPendingExtends();
        this.cancelAllPendingRequests();
        this._thread = this._generatorFunction.bind(this._context)();
        const next = this._thread.next();
        this._setPlacedBids(next);
    }

    private _getLocalBidId(): number {
        return this._currentBidPlacementId++;
    }

    private _getPlacedBidsForFlow(flowId: NameKeyId, bidOrBids?: BidOrBids): PlacedBid[] {
        const bids = bidOrBids ? toArray(bidOrBids) : undefined;
        if(bids === undefined) return [];
        return bids.map(bid => {
                const bidId = 'id' in bid ? bid.id : this._getLocalBidId();
                return {...bid, flowId: flowId, id: bidId} as PlacedBid;
        }).reverse();
    }

    private _setPlacedBids(next: IteratorResult<BidOrBids, void>): void {
        if (next.done) {
            this._placedBids = undefined;
        } else {
            this._placedBids = this._getPlacedBidsForFlow(this.id, next.value);
        }
    }

    private _processNextBid(event: EventCore<any, any>, progressedBid?: PlacedBid<unknown>, error?: any): void {
        this._inInitialState = false;
        let next: IteratorResult<BidOrBids, void>;
        let progressInfo: FlowProgressInfo | undefined;
        if(error !== undefined) {
            try {
                next = this._thread.throw(error);
            }
            catch(error) {
                // a flow is reset, if an error was not handled
                this.reset();
                return;
            }
            this._logger.logErrorReaction(this.id, event.id, error);
        }
        else {
            const remainingBids = this._placedBids?.filter(b => b.id !== progressedBid?.id);
            const extendValue = this._pendingExtends.get(event.id)?.value;
            progressInfo = {
                event,
                extend: extendValue ? {value: extendValue} : undefined,
                eventId: progressedBid!.eventId,
                remainingBids,
                flowId: this.id,
            }
            next = this._thread.next(progressInfo); // progress Flow to next bid
            this._logger.logReaction(this.id, {...progressedBid!, flowId: this.id});
        }
        this._setPlacedBids(next);
        this.cancelPendingRequests();
    }

    // --- public

    public get placedBids(): PlacedBid[] | undefined {
        return this._placedBids;
    }

    public get pendingRequests(): NameKeyId[] | undefined {
        return this._pendingRequests.allKeys;
    }

    public get pendingExtends(): NameKeyId[] | undefined {
        return this._pendingExtends.allKeys;
    }

    public progressBid(event: EventCore<any, any>, bid: PlacedBid): void {
        this._processNextBid(event, bid);
    }

    public get isCompleted(): boolean {
        return this._placedBids === undefined;
    }

    public throwError(event: EventCore<any,any>, error?: unknown): void {
        this._processNextBid(event, undefined, error);
    }

    public removePendingExtend(eventId: NameKeyId): void {
        this._pendingExtends.delete(eventId);
        this._logger.logCanceledPending(this.id, eventId, 'extend');
    }

    public cancelPendingRequests(): void {
        this._pendingRequests?.allValues?.forEach(requestAction => {
            if(!this.placedBids?.some(bid => bid.id === requestAction.id)) {
                this.cancelSinglePendingRequest(requestAction.eventId);
            }
        })
        // if a extend is extending a pending event, than it needs to be canceled if the extend-Bid is not repeated
        this._pendingExtends?.allValues?.forEach(extendContext => {
            if(extendContext.event.pendingBy && !this.placedBids?.some(bid => bid.id === extendContext.extendedBidId)) {
                this._cancelPending(extendContext.event.pendingBy, extendContext.event.id);
            }
        })
    }

    public cancelAllPendingRequests(): void {
        this._pendingRequests?.allKeys?.forEach(eventId => {
            this.cancelSinglePendingRequest(eventId);
        });
    }

    public cancelSinglePendingRequest(eventId: NameKeyId): void {
        if(this._pendingRequests.delete(eventId)) {
            this._logger.logCanceledPending(this.id, eventId, 'request');
        }
    }

    public cancelAllPendingExtends(): void {
        this._pendingExtends?.allKeys?.forEach(eventId => {
            this._pendingExtends.delete(eventId);
            this._logger.logCanceledPending(this.id, eventId, 'extend');
        });
    }

    public getBid(bidId: number): PlacedBid<any, any> | undefined {
        return this._placedBids?.find(bid => bid.id === bidId);
    }

    public addPendingExtend(eventId: NameKeyId, extendContext: ExtendContext): void {
        this._pendingExtends.set(eventId, extendContext);
    }

    public addPendingRequest(action: RequestedAsyncAction): void {
        if(!isSameNameKeyId(action.flowId, this.id)) return;
        this._pendingRequests.set(action.eventId, action);
        const promise = action.payload as Promise<any>;
        promise.then(value => {
            const bidId = this._pendingRequests.get(action.eventId)?.bidId;
            if(bidId === action.bidId) {
                const resolveAction: ResolveAction = {
                    type: "resolveAction",
                    eventId: action.eventId,
                    payload: value,
                    flowId: this.id,
                    requestActionId: action.id,
                    id: -1,
                    bidId: action.bidId
                }
                this._addToQueue(resolveAction);
            }
        }).catch(error => {
            const placementId = this._pendingRequests.get(action.eventId)?.bidId;
            if(placementId === action.bidId) {
                const rejectAction: RejectAction = {
                    type: "rejectAction",
                    eventId: action.eventId,
                    flowId: this.id,
                    payload: undefined,
                    error: error,
                    requestActionId: action.id,
                    id: -1,
                    bidId: action.bidId
                }
                this._addToQueue(rejectAction);
            }
        });
    }
}