import { AnyAction, ResolveExtendAction, getResolveExtendAction, RequestedAction } from './action';
import { PlacedBid, BidType, BThreadBids, getPlacedBidsForBThread, BidOrBids } from './bid';
import { NameKeyId, sameNameKeyId, NameKeyMap } from './name-key-map';
import { ExtendContext } from './extend-context';
import { Logger, BThreadReactionType } from './logger';
import { toExtendPendingBid, PendingBid } from './pending-bid';
import { ResolveActionCB } from './update-loop';
import { ReactionCheck } from './validation';
import { ScenarioEvent } from './scenario-event';
import { Bid, getResolveRejectAction } from '.';
import { BThreadGeneratorFunction } from './scenario';

interface NextBidProperties {
    bid: Bid;
    eventId: NameKeyId;
    error?: ErrorInfo;
}

export type ErrorInfo = {event: NameKeyId, error: any}
export type BThreadGenerator = Generator<BidOrBids, void, ScenarioProgressInfo>;

export interface BThreadContext {
    key?: string | number;
    resolveExtend: <P>(event: ScenarioEvent<P>, update: (value : P) => P) => boolean;
}

export type BThreadPublicContext = {
    isCompleted: boolean;
    pendingRequests: NameKeyMap<PendingBid>;
    pendingExtends: NameKeyMap<PendingBid>;
}


export interface ScenarioProgressInfo {
    event: ScenarioEvent<any>;
    eventId: NameKeyId;
    remainingBids?: Bid[];
}

export function isSameNameKeyId(a?: NameKeyId, b?: NameKeyId): boolean {
    if(!a || !b) return false;
    return a.name === b.name && a.key === b.key;
}

export interface BThreadParameters<P> {
    id: NameKeyId,
    generatorFunction: BThreadGeneratorFunction<P>;
    resolveActionCB: ResolveActionCB;
    scenarioEventMap: NameKeyMap<ScenarioEvent>;
    logger: Logger;
    props: P;
}

export class BThread<P> {
    public readonly id: NameKeyId;
    private readonly _resolveActionCB: ResolveActionCB;
    private readonly _logger: Logger;
    private readonly _event: NameKeyMap<ScenarioEvent<any>>
    private _thread: BThreadGenerator;
    private _placedBids: PlacedBid[] = [];
    private _nextBidOrBids?: BidOrBids;
    private _pendingRequests: NameKeyMap<PendingBid> = new NameKeyMap();
    private _pendingExtends: NameKeyMap<PendingBid> = new NameKeyMap();
    private _context: BThreadContext;
    private _isCompleted = false;


    public constructor(params: BThreadParameters<P>) {
        this.id = params.id;
        this._logger = params.logger;
        this._event = params.scenarioEventMap;
        this._resolveActionCB = params.resolveActionCB;
        this._context = this._createBThreadUtils();
        this._thread = params.generatorFunction.bind(this._context)(params.props);
        const next = this._thread.next();
        this._nextBidOrBids = next.value as BidOrBids;
        this._setCurrentBids();
    }

     // --- private

    private _createBThreadUtils(): BThreadContext {
        return {
            key:  this.id.key,
            resolveExtend: (event, updateFn): boolean => {
                const pendingBid = this._pendingExtends.get(event.id);
                if(pendingBid === undefined) return false;
                if(pendingBid.extendedRequestingBid === undefined) return false;
                return this._dispatchResolvePendingExtend(pendingBid, updateFn(pendingBid.extendedRequestingBid.payload));
            }
        }
    }

    private _setCurrentBids(): void {
        this._placedBids = getPlacedBidsForBThread(this.id, this._nextBidOrBids);
        this._pendingRequests.forEach(requestBidNameKeyId => {         // remove all pending requests, that are not placed.
            if(!this._placedBids.some(placedBid => sameNameKeyId(requestBidNameKeyId, placedBid.eventId))) {
                this._pendingRequests.deleteSingle(requestBidNameKeyId);
            }
        })
    }

    private _processNextBid(props: NextBidProperties): void {
        let next: IteratorResult<BidOrBids, void>;
        if(props.error) {
            next = this._thread.throw(props.error); // progress BThread to next bid
        } else {
            const progressInfo: ScenarioProgressInfo = {
                event: this._event.get(props.eventId)!,
                eventId: props.eventId,
                remainingBids: this._placedBids.filter(bid => !sameNameKeyId(bid.eventId, props.bid.eventId))
            }
            next = this._thread.next(progressInfo); // progress BThread to next bid
        }
        if (next.done) {
            this._pendingRequests.clear();
            delete this._nextBidOrBids;
            this._placedBids = [];
            this._isCompleted = true;
        } else {
            this._nextBidOrBids = next.value;
        }
        this._setCurrentBids(); // look at all pending requests and remove all without current bids
        this._logger.logReaction(BThreadReactionType.progress ,this.id, {...props.bid, bThreadId: this.id});
    }

    private _isValidBid(pendingBid?: PendingBid): boolean {
        if(!this._thread) return false; // thread was deleted
        if(pendingBid === undefined) return false;
        let pending: PendingBid | undefined;
        if(pendingBid.type === 'extendBid') {
            pending = this._pendingExtends.get(pendingBid.eventId);
        } else {
            pending = this._pendingRequests.get(pendingBid.eventId);
        }
        if(pending === undefined) return false;
        return pending.actionId === pendingBid.actionId ? true : false;
    }

    private _dispatchResolvePendingExtend(bid: PendingBid, data: any): boolean {
        if(this._isValidBid(bid) === false) return false;
        const response = getResolveExtendAction(bid, data);
        this._resolveActionCB(response);
        return true;
    }

    private _dispatchFinishPendingRequest(type: 'resolve' | 'reject', bid: PendingBid, data: any): boolean {
        if(this._isValidBid(bid) === false) return false;
        const actionType = (type === 'resolve') ? 'resolveAction' : 'rejectAction';
        const response = getResolveRejectAction(actionType, bid, data);
        this._resolveActionCB(response);
        return true;
    }

    private _addPendingBid(pendingBid: PendingBid): void {
        this._setCurrentBids();
        if(pendingBid.type !== 'extendBid') {
            this._logger.logReaction(BThreadReactionType.newPending, this.id, pendingBid);
        }
        pendingBid.payload!.then((data: any): void => {
            if(pendingBid.type === 'extendBid') {
                this._dispatchResolvePendingExtend(pendingBid, data);
            } else {
                this._dispatchFinishPendingRequest('resolve', pendingBid, data);
            }
        }).catch((e: Error): void => {
            this._dispatchFinishPendingRequest('reject', pendingBid, e);
        });
    }

    // --- public

    public get context(): BThreadPublicContext {
        return {
            isCompleted: this._isCompleted,
            pendingRequests: this._pendingRequests,
            pendingExtends: this._pendingExtends
        }
    }


    public get bThreadBids(): BThreadBids | undefined {
        const allPendingBids = this._pendingRequests.clone().merge(this._pendingExtends);
        if(allPendingBids.size === 0 && this._placedBids.length === 0) return undefined
        return {
            pendingBidMap: allPendingBids,
            placedBids: this._placedBids.reverse()
        }
    }

    public resetBThread(generatorFunction: BThreadGeneratorFunction<any>, nextProps: P): void {
        this._pendingRequests.clear();
        this._pendingExtends.clear();
        this._thread = generatorFunction.bind(this._context)(nextProps);
        const next = this._thread.next();
        this._nextBidOrBids = next.value as BidOrBids;
        this._setCurrentBids();
    }

    public getCurrentBid(bidType: BidType, eventId: NameKeyId): PlacedBid | undefined {
        return this._placedBids.find(placedBid => placedBid.type === bidType && sameNameKeyId(placedBid.eventId, eventId));
    }

    public addPendingRequest(action: RequestedAction): void {
        const pendingBid: PendingBid = {
            bThreadId: this.id,
            type: action.bidType,
            eventId: action.eventId,
            actionId: action.id!,
            payload: action.payload as Promise<any>,
            startTime: new Date().getTime()
        };
        this._pendingRequests.set(action.eventId, pendingBid);
        this._addPendingBid(pendingBid);
    }

    public rejectPending(eventId: NameKeyId, error: any): ReactionCheck {
        const bid = this._pendingRequests.get(eventId);
        if(bid === undefined) return ReactionCheck.BThreadWithoutMatchingBid;
        if(!this._pendingRequests.deleteSingle(eventId)) return ReactionCheck.PendingBidNotFound;
        //this._pendingRequests.clear();
        this._processNextBid({
            bid,
            eventId,
            error: {event: eventId, error: error}
        });
        this._logger.logReaction(BThreadReactionType.error, this.id);
        this._setCurrentBids();
        return ReactionCheck.OK;
    }

    public progressResolved(eventId: NameKeyId, payload: any): ReactionCheck {
        const bid = this._pendingRequests.get(eventId);
        if(bid === undefined) return ReactionCheck.RequestingBThreadNotFound;
        this._event.get(eventId)?.__setValue(payload);
        this._processNextBid({bid, eventId});
        return ReactionCheck.OK;
    }

    public deleteResolvedExtend(action: ResolveExtendAction): ReactionCheck {
        const bid = this._pendingExtends.get(action.eventId);
        if(bid === undefined) return ReactionCheck.BThreadWithoutMatchingBid;
        if(this._pendingExtends.deleteSingle(action.eventId) === false) return ReactionCheck.PendingBidNotFound;
        this._setCurrentBids();
        this._logger.logReaction(BThreadReactionType.resolvedExtend ,this.id, bid);
        return ReactionCheck.OK
    }

    public progressRequested(bidType: BidType, eventId: NameKeyId, payload: any): ReactionCheck {
        const bid = this.getCurrentBid(bidType, eventId);
        if(bid === undefined) return ReactionCheck.BThreadWithoutMatchingBid;
        this._event.get(eventId)?.__setValue(payload);
        this._processNextBid({bid, eventId});
        return ReactionCheck.OK;
    }

    public progressWait(bid: PlacedBid, eventId: NameKeyId): void {
        this._processNextBid({bid, eventId});
        this._logger.logReaction(BThreadReactionType.progress ,this.id, bid);
    }

    public progressExtend(extendedAction: AnyAction): ExtendContext | undefined {
        const bid = this.getCurrentBid('extendBid', extendedAction.eventId);
        if(bid === undefined) return undefined;
        const extendContext = new ExtendContext();
        const eventId = extendedAction.eventId;
        const pendingBid: PendingBid = toExtendPendingBid(extendedAction, extendContext, this.id);
        this._pendingExtends.set(extendedAction.eventId, pendingBid);
        this._addPendingBid(pendingBid);
        this._processNextBid({bid, eventId});
        this._logger.logReaction(BThreadReactionType.progress ,this.id, bid);
        return extendContext;
    }

    public destroy(): void {
        this._pendingExtends.clear();
        this._pendingRequests.clear();
        this._placedBids = [];
    }
}
