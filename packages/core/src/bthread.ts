import { ActionType, AnyAction, ResolveAction, ResolveExtendAction, getResolveAction, getResolveExtendAction, isResolveAction, RequestedAction, getRequestingBid } from './action';
import { PlacedBid, BidType, BThreadBids, getPlacedBidsForBThread, BidOrBids } from './bid';
import { EventMap, EventId, toEventId, sameEventId } from './event-map';
import { setEventCache, CachedItem } from './event-cache';
import * as utils from './utils';
import { ExtendContext } from './extend-context';
import { BThreadMap } from './bthread-map';
import { Logger, ScaffoldingResultType, BThreadReactionType } from './logger';
import { BThreadGenerator, BThreadGeneratorFunction, ScenarioInfo } from './scenario';
import { SingleActionDispatch } from './index';
import { getExtendPendingBid, PendingBid } from './pending-bid';
import { ResolveActionCB } from './update-loop';


export type BThreadKey = string | number;
export type BThreadId = {name: string; key?: BThreadKey};
type BThreadProps = Record<string, any>;

export interface BThreadContext {
    key?: BThreadKey;
    section: (newValue: string) => void;
    clearSection: () => void;
    isPending: (event: string | EventId) => boolean;
}

export interface BThreadState {
    id: BThreadId;
    section?: string;
    bids?: Record<BidType, EventMap<PlacedBid>>;
    destroyOnDisable?: boolean;
    isCompleted: boolean;
    description?: string;
    orderIndex: number;
    progressionCount: number;
    cancelledPending: EventMap<PendingBid>;
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
    private _currentBids?: BThreadBids;
    public get currentBids(): BThreadBids | undefined { return this._currentBids; }
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
            cancelledPending: new EventMap(),
            description: scenarioInfo.description,
            section: undefined,
            bids: undefined,
            isCompleted: false,
            progressionCount: -1 // not counting the initial progression
        };
        this.idString = BThreadMap.toIdString(id);
        this._resolveActionCB = resolveActionCB;
        this._generatorFunction = generatorFunction.bind(this._getBThreadContext());
        this._currentProps = props;
        this._thread = this._generatorFunction(this._currentProps);
        this._logger = logger;
        this._processNextBid();
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
            isPending: (event: string | EventId) => !!this._state.bids?.pending.has(toEventId(event)),
        };
    }

    private _cancelPendingRequests(eventId?: EventId) {
        this._state.cancelledPending.clear();
        this._pendingRequests.forEach((id, pendingBid) => {
            if(eventId === undefined || !sameEventId(eventId, id)) {
                this._state.cancelledPending.set(id, pendingBid);
                this._pendingRequests.deleteSingle(id);
            }
        })
    }

    private _setCurrentBids() {
        const pending = this._pendingRequests.clone().merge(this._pendingExtends);
        this._currentBids = getPlacedBidsForBThread(this.id, this._nextBidOrBids, pending);
        this._state.bids = this._currentBids;
    }

    private _processNextBid(returnValue?: any): void {
        const next = this._thread.next(returnValue); // progress BThread to next bid
        this._state.progressionCount++;
        if (next.done) {
            this._state.isCompleted = true;
            delete this._state.section;
            delete this._nextBidOrBids;
            delete this._currentBids;
        } else {
            this._nextBidOrBids = next.value;
        }
        this._setCurrentBids();
    }

    private _progressBThread(eventId: EventId, payload: any, isReject = false): void {
        this._cancelPendingRequests(eventId);
        let returnVal;
        if(!isReject) {
            returnVal = Array.isArray(this._nextBidOrBids) ? [eventId, payload] : payload;
        }
        this._pendingRequests.clear();
        this._processNextBid(returnVal);
    }

    private _deletePending(action: ResolveAction | ResolveExtendAction): boolean {
        if(isResolveAction(action)) {
            return this._pendingRequests.deleteSingle(action.eventId);
        }
        else {
            return this._pendingExtends.deleteSingle(action.eventId);
        }
    }

    private _resetBThread(props: BThreadProps) {
        this._pendingExtends = new EventMap();
        this._currentProps = props;
        this._state.isCompleted = false;
        this._state.progressionCount = -1;
        delete this._state.section;
        this._thread = this._generatorFunction(this._currentProps);
        this._cancelPendingRequests();
        this._processNextBid(); // progress BThread
    }

    private _validateBid(pendingBid: PendingBid) {
        if(!this._thread) return false; // thread was deleted
        if(pendingBid === undefined) return false;
        if(pendingBid.type === BidType.extend) {
            if(pendingBid.actionId !== this._pendingExtends.get(pendingBid.eventId)?.actionId) return false;
        } else {
            if(pendingBid.actionId !== this._pendingRequests.get(pendingBid.eventId)?.actionId) return false;
        }
        return true;
    }

    private _progressBid(eventCache: EventMap<CachedItem<any>>, bid: PlacedBid, payload: any): void {
        if(bid.type === BidType.set) {
            setEventCache(eventCache, bid.eventId, payload);
        }
        this._progressBThread(bid.eventId, payload);
        this._logger.logReaction(BThreadReactionType.progress ,this.id, this._state, bid);
    }

    // --- public

    public getCurrentBid(bidType: BidType, eventId: EventId): PlacedBid | undefined {
        return this._currentBids?.[bidType]?.get(eventId);
    }

    public resetOnPropsChange(nextProps: BThreadProps): boolean {
        const changedPropNames = utils.getChangedProps(this._currentProps, nextProps);
        if (changedPropNames === undefined) return false;
        this._resetBThread(nextProps);
        return true;
    }

    public addPendingExtend(extendedAction: AnyAction, extendContext: ExtendContext): void { 
        const pendingBid: PendingBid = getExtendPendingBid(extendedAction, extendContext, this.id);
        this._pendingExtends.set(extendedAction.eventId, pendingBid);
        this._addPendingBid(pendingBid, extendContext.requestingBid);
    }

    public addPendingRequest(action: RequestedAction): void{
        const pendingBid: PendingBid = {
            bThreadId: this.id, 
            type: action.bidType, 
            eventId: action.eventId, 
            actionId: action.id!, 
            payload: action.payload,
        };
        this._pendingRequests.set(action.eventId, pendingBid);
        this._addPendingBid(pendingBid);
    }

    private _addPendingBid(pendingBid: PendingBid, extendedBid?: PlacedBid): void { 
        this._setCurrentBids();
        const startTime = new Date().getTime();
        this._logger.logReaction(BThreadReactionType.newPending, this.id, this._state, pendingBid);
        pendingBid.payload.then((data: any): void => {
            if(this._validateBid(pendingBid) === false) return;
            const requestDuration = new Date().getTime() - startTime;
            const response = extendedBid ? getResolveExtendAction(pendingBid, extendedBid, requestDuration, data) : getResolveAction(ActionType.resolved, pendingBid, requestDuration, data);
            this._resolveActionCB(response);
        }).catch((e: Error): void => {
            if(this._validateBid(pendingBid) === false) return; 
            const requestDuration = new Date().getTime() - startTime;
            const response = getResolveAction(ActionType.rejected, pendingBid, requestDuration, e);
            this._resolveActionCB(response);
        });
    }

    public rejectPending(action: ResolveAction): void {
        this._thread.throw({event: action.eventId, error: action.payload});
        this._progressBThread(action.eventId, action.payload, true);
        this._logger.logReaction(BThreadReactionType.error, this.id, this._state, this.getCurrentBid(BidType.pending, action.eventId));
        this._deletePending(action);
        this._setCurrentBids();
        this._cancelPendingRequests(action.eventId);
    }

    public progressResolved(eventCache: EventMap<CachedItem<any>>, action: ResolveExtendAction | ResolveAction): void {
        const bid = this._pendingRequests.get(action.eventId);
        if(bid === undefined) return;
        this._progressBid(eventCache, bid, action.payload);
    }

    public progressResolvedExtend(eventCache: EventMap<CachedItem<any>>, action: ResolveExtendAction): void {        
        if(action.extendedRequestingBid === undefined) return;
        this._progressBid(eventCache, action.extendedRequestingBid, action.payload);
    }

    public progressRequested(eventCache: EventMap<CachedItem<any>>, action: RequestedAction): void {
        const bid = this.getCurrentBid(action.bidType, action.eventId);
        if(bid === undefined) return;
        this._progressBid(eventCache, bid, action.payload);
    }

    public progressWait(bid: PlacedBid, action: AnyAction): void {
        this._progressBThread(bid.eventId, action.payload);
        this._logger.logReaction(BThreadReactionType.progress ,this.id, this._state, bid);
    }

    public progressExtend(action: AnyAction): ExtendContext {
        const extendContext = new ExtendContext(action.payload, getRequestingBid(action));
        this._progressBThread(action.eventId, extendContext);
        this._logger.logReaction(BThreadReactionType.progress ,this.id, this._state, this._currentBids?.pending?.get(action.eventId));
        extendContext.createPromiseIfNotCompleted();
        if(extendContext.promise) {
            this.addPendingExtend(action, extendContext);
        }
        return extendContext;
    }

    public destroy(): void {
        this._pendingExtends.clear();
        this._cancelPendingRequests();
        delete this._currentBids;
        this._logger.logScaffoldingResult(ScaffoldingResultType.destroyed, this.id);
    }
}