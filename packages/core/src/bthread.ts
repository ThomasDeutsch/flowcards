import { AnyAction, ResolveAction, ResolveExtendAction, getResolveAction, getResolveExtendAction, RequestedAction } from './action';
import { PlacedBid, BidType, BThreadBids, getPlacedBidsForBThread, BidOrBids, ProgressedBid } from './bid';
import { EventMap, EventId, toEventId, sameEventId } from './event-map';
import { setEventCache, CachedItem } from './event-cache';
import * as utils from './utils';
import { ExtendContext } from './extend-context';
import { BThreadMap } from './bthread-map';
import { Logger, ScaffoldingResultType, BThreadReactionType } from './logger';
import { toExtendPendingBid, PendingBid } from './pending-bid';
import { ResolveActionCB } from './update-loop';
import { Bid, BidsByType, request, toBidsByType } from '.';
import { ReactionCheck } from './validation';

export type ErrorInfo = {event: EventId, error: any}
export type BThreadGenerator = Generator<BidOrBids, any, ProgressedBid>;
type BThreadProps = Record<string, unknown>;
export type BThreadGeneratorFunction = (props: any) => BThreadGenerator;
export interface ScenarioInfo {
    id: string;
    destroyOnDisable?: boolean;
    description?: string;
}

export type BThreadKey = string | number;
export type BThreadId = {
    name: string;
    key?: BThreadKey
};

export interface BThreadContext {
    key?: BThreadKey;
    section: (newValue: string) => void;
    clearSection: () => void;
    isPending: (event: string | EventId) => boolean;
}

export interface BThreadState {
    id: BThreadId;
    section?: string;
    destroyOnDisable?: boolean;
    isCompleted: boolean;
    description?: string;
    orderIndex: number;
    progressionCount: number;
    latestProgressedBid?: ProgressedBid;
    pendingBids: EventMap<PendingBid>;
    bids: BidsByType;
    cancelledBids?: EventMap<PlacedBid>;
}

export function isSameBThreadId(a?: BThreadId, b?: BThreadId): boolean {
    if(!a || !b) return false;
    return a.name === b.name && a.key === b.key;
}

export class BThread {
    public readonly idString: string;
    public readonly id: BThreadId;
    private readonly _resolveActionCB: ResolveActionCB;
    private readonly _generatorFunction: BThreadGeneratorFunction;
    private readonly _logger: Logger;
    private _currentProps: BThreadProps;
    private _thread: BThreadGenerator;
    private _currentBids: PlacedBid[] = [];
    public get bThreadBids(): BThreadBids | undefined {
        if(this._state.pendingBids.size() === 0 && this._currentBids.length === 0) return undefined
        return {pendingBidMap: this._state.pendingBids, placedBids: this._currentBids }}
    private _nextBidOrBids?: BidOrBids;
    public set orderIndex(val: number) { this._state.orderIndex = val; }
    private _pendingRequests: EventMap<PendingBid> = new EventMap();
    private _pendingExtends: EventMap<PendingBid> = new EventMap();
    private _state: BThreadState;
    public get state(): BThreadState { return this._state; }

    public constructor(id: BThreadId, scenarioInfo: ScenarioInfo, orderIndex: number, generatorFunction: BThreadGeneratorFunction, props: BThreadProps, resolveActionCB: ResolveActionCB, logger: Logger) {
        this.id = id;
        this._state = {
            id: id,
            orderIndex: orderIndex,
            destroyOnDisable: scenarioInfo.destroyOnDisable,
            description: scenarioInfo.description,
            section: undefined,
            isCompleted: false,
            progressionCount: 0,
            latestProgressedBid: undefined,
            pendingBids: new EventMap(),
            bids: {}

        };
        this.idString = BThreadMap.toIdString(id);
        this._resolveActionCB = resolveActionCB;
        this._generatorFunction = generatorFunction.bind(this._getBThreadContext());
        this._currentProps = props;
        this._thread = this._generatorFunction(this._currentProps);
        this._logger = logger;
        const next = this._thread.next();
        this._nextBidOrBids = next.value;
        this._setCurrentBids();
        this._logger.logReaction(BThreadReactionType.init, this.id, this._state);
    }

     // --- private

     private _getBThreadContext(): BThreadContext {
        const section = (value?: string) => {
            if(!value) this._state.section = undefined;
            this._state.section = value;
        }
        const removeSection = () => {
            this._state.section = undefined;
        }
        return {
            key: this._state.id.key,
            section: section,
            clearSection: removeSection,
            isPending: (event: string | EventId) => this._isPending(event),
        };
    }

    private _isPending(eventId: EventId | string): boolean {
        return this._pendingRequests.has(eventId) || this._pendingExtends.has(eventId);
    }

    private _setCurrentBids(): void {
        this._currentBids = getPlacedBidsForBThread(this.id, this._nextBidOrBids);
        this._pendingRequests.forEach(requestBidEventId => {         // remove all pending requests, that are not placed.
            if(!this._currentBids.some(placedBid => sameEventId(requestBidEventId, placedBid.eventId))) {
                this._pendingRequests.deleteSingle(requestBidEventId);
            }
        })
        const allPendingBids = this._pendingRequests.clone().merge(this._pendingExtends);
        this._state.pendingBids = allPendingBids;
        this._state.bids = toBidsByType({pendingBidMap: allPendingBids, placedBids: this._currentBids})
    }

    private _cancelPendingRequests(eventId?: EventId): EventMap<PlacedBid> | undefined {
        const cancelledBids = new EventMap<PlacedBid>();
        this._pendingRequests.forEach((id, pendingBid) => {
            if(!eventId || !sameEventId(eventId, id)) {
                cancelledBids.set(id, pendingBid);
                this._pendingRequests.deleteSingle(id);
            }
        });
        this._pendingRequests.clear();
        return cancelledBids.size() > 0 ? cancelledBids : undefined;
    }


    private _processNextBid(placedBid: PlacedBid, payload: any, error?: ErrorInfo): void {
        const remainingBids = this._currentBids.filter(bid => !sameEventId(bid.eventId, placedBid.eventId));
        let progressedBid: ProgressedBid = {
            ...placedBid,
            payload: payload,
            remainingBids: remainingBids.length > 0 ? remainingBids : undefined,
            is: (eventId: EventId | string) => sameEventId(progressedBid.eventId, toEventId(eventId))
        }
        if(progressedBid.type === 'extendBid') {
            progressedBid = {
                ...progressedBid,
                payload: payload.value, // payload
                resolve: payload.resolve.bind(payload) // resolve FN
            }
        }
        let next;
        if(error) {
            next = this._thread.throw(error); // progress BThread to next bid
        } else {
            next = this._thread.next(progressedBid); // progress BThread to next bid
        }
        this._state.progressionCount++;
        this._state.latestProgressedBid = progressedBid;
        if (next.done) {
            this._pendingRequests.clear();
            delete this._nextBidOrBids;
            this._currentBids = [];
            this._state.isCompleted = true;
            this._state.bids = {};
            this._state.pendingBids = new EventMap();
        } else {
            this._nextBidOrBids = next.value;
        }
        this._setCurrentBids(); // look at all pending requests and remove all without current bids
    }

    private _resetBThread(props: BThreadProps) {
        this._cancelPendingRequests();
        this._pendingExtends = new EventMap();
        this._currentProps = props;
        this._state.isCompleted = false;
        this._state.progressionCount = -1;
        delete this._state.section;
        this._thread = this._generatorFunction(this._currentProps);
        const next = this._thread.next();
        this._nextBidOrBids = next.value;
        this._setCurrentBids();
    }

    private _validateBid(pendingBid: PendingBid) {
        if(!this._thread) return false; // thread was deleted
        if(pendingBid === undefined) return false;
        if(pendingBid.type === 'extendBid') {
            if(this._pendingExtends.has(pendingBid.eventId)) return true;
        } else {
            if(this._pendingRequests.has(pendingBid.eventId)) return true;
        }
        return false;
    }

    private _progressBid(bid: PlacedBid, payload: any, eventCache?: EventMap<CachedItem<any>>, error?: ErrorInfo): void {
        if(!error && (bid.type === 'setBid') && eventCache) {
            setEventCache(eventCache, bid.eventId, payload);
        }
        this._processNextBid(bid, payload, error);
        this._logger.logReaction(BThreadReactionType.progress ,this.id, this._state, bid);
    }

    // --- public

    public getCurrentBid(bidType: BidType, eventId: EventId): PlacedBid | undefined {
        return this._currentBids.find(placedBid => placedBid.type === bidType && sameEventId(placedBid.eventId, eventId))
    }

    public resetOnPropsChange(nextProps: BThreadProps): boolean {
        const changedPropNames = utils.getChangedProps(this._currentProps, nextProps);
        if (changedPropNames === undefined) return false;
        this._resetBThread(nextProps);
        return true;
    }

    public addPendingRequest(action: RequestedAction): void {
        const pendingBid: PendingBid = {
            bThreadId: this.id,
            type: action.bidType,
            eventId: action.eventId,
            actionId: action.id!,
            payload: action.payload
        };
        this._pendingRequests.set(action.eventId, pendingBid);
        this._addPendingBid(pendingBid);
    }

    private _addPendingBid(pendingBid: PendingBid): void {
        this._setCurrentBids();
        const startTime = new Date().getTime();
        if(pendingBid.type !== 'extendBid') {
            this._logger.logReaction(BThreadReactionType.newPending, this.id, this._state, pendingBid);
        }
        pendingBid.payload.then((data: any): void => {
            if(this._validateBid(pendingBid) === false) return;
            const requestDuration = new Date().getTime() - startTime;
            const response = (pendingBid.type === 'extendBid') ? getResolveExtendAction(pendingBid, requestDuration, data) : getResolveAction("resolveAction", pendingBid, requestDuration, data);
            this._resolveActionCB(response);
        }).catch((e: Error): void => {
            if(this._validateBid(pendingBid) === false) return;
            const requestDuration = new Date().getTime() - startTime;
            const response = getResolveAction("rejectAction", pendingBid, requestDuration, e);
            this._resolveActionCB(response);
        });
    }

    public rejectPending(action: ResolveAction): ReactionCheck {
        const bid = this._pendingRequests.get(action.eventId);
        if(bid === undefined) return ReactionCheck.BThreadWithoutMatchingBid;
        if(!this._pendingRequests.deleteSingle(action.eventId)) return ReactionCheck.PendingBidNotFound;
        this._pendingRequests.clear();
        this._progressBid(bid, action.payload, undefined, {event: action.eventId, error: action.payload});
        this._logger.logReaction(BThreadReactionType.error, this.id, this._state);
        this._setCurrentBids();
        return ReactionCheck.OK;
    }

    public progressResolved(eventCache: EventMap<CachedItem<any>>, action: ResolveExtendAction | ResolveAction): ReactionCheck {
        const bid = this._pendingRequests.get(action.eventId);
        if(bid === undefined) return ReactionCheck.RequestingBThreadNotFound;
        this._progressBid(bid, action.payload, eventCache);
        return ReactionCheck.OK;
    }

    public deleteResolvedExtend(action: ResolveExtendAction): ReactionCheck {
        const bid = this._pendingExtends.get(action.eventId);
        if(bid === undefined) return ReactionCheck.BThreadWithoutMatchingBid;
        if(this._pendingExtends.deleteSingle(action.eventId) === false) return ReactionCheck.PendingBidNotFound;
        this._setCurrentBids();
        this._logger.logReaction(BThreadReactionType.resolvedExtend ,this.id, this._state, bid);
        return ReactionCheck.OK
    }

    public progressRequested(eventCache: EventMap<CachedItem<any>>, bidType: BidType, eventId: EventId, payload: unknown): ReactionCheck {
        const bid = this.getCurrentBid(bidType, eventId);
        if(bid === undefined) return ReactionCheck.BThreadWithoutMatchingBid;
        this._progressBid(bid, payload, eventCache);
        return ReactionCheck.OK;
    }

    public progressWait(bid: PlacedBid, action: AnyAction): void {
        this._progressBid(bid, action.payload);
        this._logger.logReaction(BThreadReactionType.progress ,this.id, this._state, bid);
    }

    public progressExtend(extendedAction: AnyAction): ExtendContext | undefined {
        const bid = this.getCurrentBid('extendBid', extendedAction.eventId);
        if(bid === undefined) return undefined;
        const extendContext = new ExtendContext(extendedAction.payload);
        this._progressBid(bid, extendContext);
        extendContext.createPromiseIfNotCompleted();
        if(extendContext.promise) {
            const pendingBid: PendingBid = toExtendPendingBid(extendedAction, extendContext, this.id);
            this._pendingExtends.set(extendedAction.eventId, pendingBid);
            this._addPendingBid(pendingBid);
        }
        this._logger.logReaction(BThreadReactionType.progress ,this.id, this._state, bid);
        return extendContext;
    }

    public destroy(): void {
        this._pendingExtends.clear();
        this._pendingRequests.clear();
        this._currentBids = [];
        this._logger.logScaffoldingResult(ScaffoldingResultType.destroyed, this.id);
    }
}
