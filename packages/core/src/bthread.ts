import { AnyAction, ResolveExtendAction, getResolveAction, getResolveExtendAction, RequestedAction } from './action';
import { PlacedBid, BidType, BThreadBids, getPlacedBidsForBThread, BidOrBids, BidsByType, toBidsByType } from './bid';
import { NameKeyId, toNameKeyId, sameNameKeyId, NameKeyMap } from './name-key-map';
import { ExtendContext } from './extend-context';
import { Logger, BThreadReactionType } from './logger';
import { toExtendPendingBid, PendingBid } from './pending-bid';
import { ResolveActionCB } from './update-loop';
import { ReactionCheck } from './validation';
import { ScenarioEvent } from './scenario-event';
import { Bid } from '.';
import { BThreadGeneratorFunction } from './scenario';

interface NextBidProperties {
    bid: Bid;
    eventId: NameKeyId;
    error?: ErrorInfo;
}

export type ErrorInfo = {event: NameKeyId, error: any}
export type BThreadGenerator = Generator<BidOrBids, void, ScenarioProgressInfo>;

export interface BThreadUtils {
    key?: string | number;
    section: (newValue: string) => void;
    clearSection: () => void;
}

export interface ScenarioProgressInfo {
    event: ScenarioEvent;
    eventId: NameKeyId;
    remainingBids?: Bid[];
}

export interface BThreadState {
    id: NameKeyId;
    isEnabled: boolean;
    section?: string;
    isCompleted: boolean;
    pendingBids: NameKeyMap<PendingBid>;
    bids: BidsByType;
    cancelledBids?: NameKeyMap<PlacedBid>;
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
    private readonly _event: NameKeyMap<ScenarioEvent>
    private _thread: BThreadGenerator;
    private _placedBids: PlacedBid[] = [];
    public get bThreadBids(): BThreadBids | undefined {
        if(this._state.pendingBids.size === 0 && this._placedBids.length === 0) return undefined
        return {pendingBidMap: this._state.pendingBids, placedBids: this._placedBids.reverse() }}
    private _nextBidOrBids?: BidOrBids;
    private _pendingRequests: NameKeyMap<PendingBid> = new NameKeyMap();
    private _pendingExtends: NameKeyMap<PendingBid> = new NameKeyMap();
    private _state: BThreadState;
    public get state(): BThreadState { return this._state }
    private _utils: BThreadUtils;

    private _createState(): BThreadState {
        return {
            id: this.id,
            isEnabled: true,
            section: undefined,
            isCompleted: false,
            pendingBids: new NameKeyMap(),
            bids: {},
        };
    }

    public constructor(params: BThreadParameters<P>) {
        this.id = params.id;
        this._logger = params.logger;
        this._event = params.scenarioEventMap;
        this._resolveActionCB = params.resolveActionCB;
        this._state = this._createState();
        this._utils = this._createBThreadUtils();
        this._thread = params.generatorFunction.bind(this._utils)(params.props);
        const next = this._thread.next();
        this._nextBidOrBids = next.value as BidOrBids;
        this._setCurrentBids();
    }

     // --- private

    private _createBThreadUtils(): BThreadUtils {
        return {
            section: (value?: string) => {
                if(!value) this._state.section = undefined;
                this._state.section = value;
            },
            clearSection: () => { this._state.section = undefined; },
            key:  this.id.key
        }
    }

    private _setCurrentBids(): void {
        this._placedBids = getPlacedBidsForBThread(this.id, this._nextBidOrBids);
        this._pendingRequests.forEach(requestBidNameKeyId => {         // remove all pending requests, that are not placed.
            if(!this._placedBids.some(placedBid => sameNameKeyId(requestBidNameKeyId, placedBid.eventId))) {
                this._pendingRequests.deleteSingle(requestBidNameKeyId);
            }
        })
        const allPendingBids = this._pendingRequests.clone().merge(this._pendingExtends);
        this._state.pendingBids = allPendingBids;
        this._state.bids = toBidsByType({pendingBidMap: allPendingBids, placedBids: this._placedBids})
    }

    private _cancelPendingRequests(eventId?: NameKeyId): NameKeyMap<PlacedBid> | undefined {
        const cancelledBids = new NameKeyMap<PlacedBid>();
        this._pendingRequests.forEach((id, pendingBid) => {
            if(!eventId || !sameNameKeyId(eventId, id)) {
                cancelledBids.set(id, pendingBid);
                this._pendingRequests.deleteSingle(id);
            }
        });
        this._pendingRequests.clear();
        return cancelledBids.size > 0 ? cancelledBids : undefined;
    }

    private _processNextBid(props: NextBidProperties): void {
        let next: IteratorResult<BidOrBids, void>;
        if(props.error) {
            next = this._thread.throw(props.error); // progress BThread to next bid
        } else {
            const progressInfo: ScenarioProgressInfo = {
                event: this._event.get({name: props.eventId.name})!,
                eventId: props.eventId,
                remainingBids: this._placedBids.filter(bid => !sameNameKeyId(bid.eventId, props.bid.eventId))
            }
            next = this._thread.next(progressInfo); // progress BThread to next bid
        }
        if (next.done) {
            this._pendingRequests.clear();
            delete this._nextBidOrBids;
            this._placedBids = [];
            this._state.isCompleted = true;
            this._state.bids = {};
            this._state.pendingBids = new NameKeyMap();
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

    // --- public

    public resetBThread(generatorFunction: BThreadGeneratorFunction<any>, nextProps: P): void {
        this._cancelPendingRequests();
        this._pendingExtends = new NameKeyMap();
        this._state = this._createState();
        this._thread = generatorFunction.bind(this._utils)(nextProps);
        const next = this._thread.next();
        this._nextBidOrBids = next.value as BidOrBids;
        this._setCurrentBids();
    }

    public setEnabled(isEnabled: boolean): void {
        this._state.isEnabled = isEnabled;
    }

    public getCurrentBid(bidType: BidType, eventId: NameKeyId): PlacedBid | undefined {
        return this._placedBids.find(placedBid => placedBid.type === bidType && sameNameKeyId(placedBid.eventId, eventId))
    }

    public addPendingRequest(action: RequestedAction): void {
        const pendingBid: PendingBid = {
            bThreadId: this.id,
            type: action.bidType,
            eventId: action.eventId,
            actionId: action.id!,
            payload: action.payload,
            startTime: new Date().getTime()
        };
        this._pendingRequests.set(action.eventId, pendingBid);
        this._addPendingBid(pendingBid);
    }

    private _addPendingBid(pendingBid: PendingBid): void {
        this._setCurrentBids();
        if(pendingBid.type !== 'extendBid') {
            this._logger.logReaction(BThreadReactionType.newPending, this.id, pendingBid);
        }
        pendingBid.payload.then((data: any): void => {
            if(this._isValidBid(pendingBid) === false) return;
            const response = (pendingBid.type === 'extendBid') ? getResolveExtendAction(pendingBid, data) : getResolveAction("resolveAction", pendingBid, data);
            this._resolveActionCB(response);
        }).catch((e: Error): void => {
            if(this._isValidBid(pendingBid) === false) return;
            const response = getResolveAction("rejectAction", pendingBid, e);
            this._resolveActionCB(response);
        });
    }

    public cancelPending(eventId: NameKeyId | string, message: string): boolean {
        const pendingBid = this._pendingRequests.get(toNameKeyId(eventId));
        if(this._isValidBid(pendingBid) === false) return false;
        const response = getResolveAction("rejectAction", pendingBid!, message);
        this._resolveActionCB(response);
        return true;
    }

    public rejectPending(eventId: NameKeyId, error: any): ReactionCheck {
        const bid = this._pendingRequests.get(eventId);
        if(bid === undefined) return ReactionCheck.BThreadWithoutMatchingBid;
        if(!this._pendingRequests.deleteSingle(eventId)) return ReactionCheck.PendingBidNotFound;
        this._pendingRequests.clear();
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
        this._event.get({name: eventId.name})?.__setValue(payload, eventId.key);
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
        this._event.get({name: eventId.name})?.__setValue(payload, eventId.key);
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
        const extendContext = new ExtendContext(extendedAction.payload);
        const eventId = extendedAction.eventId
        this._processNextBid({bid, eventId}); //TODO: is this correct?
        extendContext.createPromiseIfNotCompleted();
        if(extendContext.promise) {
            const pendingBid: PendingBid = toExtendPendingBid(extendedAction, extendContext, this.id);
            this._pendingExtends.set(extendedAction.eventId, pendingBid);
            this._addPendingBid(pendingBid);
        }
        this._logger.logReaction(BThreadReactionType.progress ,this.id, bid);
        return extendContext;
    }

    public destroy(): void {
        this._pendingExtends.clear();
        this._pendingRequests.clear();
        this._placedBids = [];
        this._state = this._createState();
    }
}
