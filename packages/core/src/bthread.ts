import { Action, ActionType } from './action';
import { Bid, BidType, BThreadBids, getBidsForBThread } from './bid';
import { EventMap, EventId, toEventId, sameEventId } from './event-map';
import { setEventCache, CachedItem } from './event-cache';
import * as utils from './utils';
import { ExtendContext } from './extend-context';
import { BThreadMap } from './bthread-map';
import { Logger, ScaffoldingResultType } from './logger';
import { BThreadGenerator, BThreadGeneratorFunction, ScenarioInfo } from './scenario';
import { SingleActionDispatch } from '.';

export type BThreadKey = string | number;
export type BThreadId = {name: string; key?: BThreadKey};
type BThreadProps = Record<string, any>;

export interface BThreadContext {
    key?: BThreadKey;
    section: (newValue: string) => void;
    clearSection: () => void;
    isPending: (event: string | EventId) => boolean;
}

export interface PendingEventInfo {
    eventId: EventId;
    bThreadId: BThreadId;
    actionId: number | null;
    isExtend: boolean;
}

export interface BThreadState {
    id: BThreadId;
    section?: string;
    bids?: Record<BidType, EventMap<Bid>>;
    pending: EventMap<PendingEventInfo>;
    destroyOnDisable?: boolean;
    isCompleted: boolean;
    description?: string;
    orderIndex: number;
    isAutoRepeat?: boolean;
    completeCount: number;
    progressionCount: number;
    cancelledPending: EventMap<PendingEventInfo>;
}

export class BThread {
    public readonly idString: string;
    public readonly id: BThreadId;
    private readonly _singleActionDispatch: SingleActionDispatch;
    private readonly _generatorFunction: BThreadGeneratorFunction;
    private readonly _logger: Logger;
    private _currentProps: BThreadProps;
    private _thread: BThreadGenerator;
    private _currentBids?: BThreadBids;
    public get currentBids(): BThreadBids | undefined { return this._currentBids; }
    private _nextBid?: any;
    public set orderIndex(val: number) { this._state.orderIndex = val; }
    private _pendingRequests: EventMap<PendingEventInfo> = new EventMap();
    private _pendingExtends: EventMap<PendingEventInfo> = new EventMap();
    private _state: BThreadState;
    public get state(): BThreadState { return this._state; }

    public constructor(id: BThreadId, scenarioInfo: ScenarioInfo, orderIndex: number, generatorFunction: BThreadGeneratorFunction, props: BThreadProps, singleActionDispatch: SingleActionDispatch, logger: Logger) {
        this.id = id;
        this._state = {
            id: id,
            orderIndex: orderIndex,
            destroyOnDisable: scenarioInfo.destroyOnDisable,
            cancelledPending: new EventMap(),
            description: scenarioInfo.description,
            isAutoRepeat: scenarioInfo.autoRepeat,
            completeCount: 0,
            section: undefined,
            pending: new EventMap(),
            isCompleted: false,
            progressionCount: -1 // not counting the initial progression
        };
        this.idString = BThreadMap.toIdString(id);
        this._singleActionDispatch = singleActionDispatch;
        this._generatorFunction = generatorFunction.bind(this._getBThreadContext());
        this._currentProps = props;
        this._thread = this._generatorFunction(this._currentProps);
        this._logger = logger;
        this._processNextBid();
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
            isPending: (event: string | EventId) => this._state.pending.has(toEventId(event)),
        };
    }

    private _cancelPendingRequests(eventId?: EventId) {
        this._state.cancelledPending.clear();
        this._pendingRequests.forEach((id, pendingEventInfo) => {
            if(eventId === undefined || !sameEventId(eventId, id)) {
                this._state.cancelledPending.set(id, pendingEventInfo);
                this._pendingRequests.deleteSingle(id);
            }
        })
    }

    private _setCurrentBids() {
        this._state.pending = this._pendingRequests.clone().merge(this._pendingExtends);
        this._currentBids = getBidsForBThread(this.id, this._nextBid, this._state.pending);
        this._state.bids = this._currentBids;
    }

    private _processNextBid(returnValue?: any): void {
        const next = this._thread.next(returnValue); // progress BThread to next bid
        this._state.progressionCount++;
        if (next.done && this._state.isAutoRepeat) {
            this._resetBThread(this._currentProps);
            this._state.completeCount++;
            return;
        } else if (next.done) {
            this._state.isCompleted = true;
            this._state.completeCount++;
            delete this._state.section;
            delete this._nextBid;
            delete this._currentBids;
        } else {
            this._nextBid = next.value;
        }
        this._setCurrentBids();
    }

    private _progressBThread(eventId: EventId, payload: any, isReject = false): void { 
        let returnVal;
        if(!isReject) {
            returnVal = Array.isArray(this._nextBid) ? [eventId, payload] : payload;
        }
        this._pendingRequests.clear();
        this._processNextBid(returnVal);
    }

    private _deletePending(action: Action): boolean {
        if(action.resolve?.isResolvedExtend) {
            return this._pendingExtends.deleteSingle(action.eventId);
        }
        else {
            return this._pendingRequests.deleteSingle(action.eventId);
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

    // --- public

    public resetOnPropsChange(nextProps: BThreadProps): boolean {
        const changedPropNames = utils.getChangedProps(this._currentProps, nextProps);
        if (changedPropNames === undefined) return false;
        this._state.completeCount = 0;
        this._resetBThread(nextProps);
        return true;
    }

    public addPendingEvent(action: Action, isExtendPromise: boolean): void {
        const eventInfo: PendingEventInfo = {
            bThreadId: action.bThreadId || this.id,
            eventId: action.eventId,
            actionId: action.id,
            isExtend: isExtendPromise
        }    
        if(isExtendPromise) {
            this._pendingExtends.set(action.eventId, eventInfo);
        } else {
            this._pendingRequests.set(action.eventId, eventInfo);
        }
        this._setCurrentBids();
        const startTime = new Date().getTime();
        this._logger.logBThreadNewPending(this.id, { type: action.bidType!, bThreadId: action.bThreadId, eventId: action.eventId}, this._state);
        action.payload.then((data: any): void => {
            if(!this._thread) return; // thread was deleted
            const pendingEventInfo = isExtendPromise ? this._pendingExtends.get(action.eventId) : this._pendingRequests.get(action.eventId);
            if(pendingEventInfo === undefined || pendingEventInfo.actionId === null) return;
            if(pendingEventInfo.actionId !== action.id) return;
            if (pendingEventInfo.actionId === action.id) {
                if(!isExtendPromise) this._cancelPendingRequests(pendingEventInfo.eventId);
                const requestDuration = new Date().getTime() - startTime;
                this._singleActionDispatch({
                    id: action.resolveActionId || null, 
                    type: ActionType.resolve,
                    bThreadId: this.id,
                    eventId: action.eventId,
                    bidType: action.bidType,
                    payload: data,
                    resolve: {
                        isResolvedExtend: isExtendPromise,
                        requestLoopIndex: action.id!,
                        requestDuration: requestDuration
                    }
                });
            }
        }).catch((e: Error): void => {
            if(!this._thread) return; // was deleted
            const pendingEventInfo = this.state.pending.get(action.eventId);
            if (pendingEventInfo?.actionId === action.id) {
                const requestDuration = new Date().getTime() - startTime;
                this._singleActionDispatch({
                    id: action.resolveActionId || null,
                    type: ActionType.reject,
                    bThreadId: this.id,
                    eventId: action.eventId,
                    bidType: action.bidType,
                    payload: e,
                    resolve: {
                        isResolvedExtend: isExtendPromise,
                        requestLoopIndex: action.id!,
                        requestDuration: requestDuration
                    }
                });
            }
        });
    }

    public resolvePending(action: Action): boolean {
        if(this._deletePending(action) === false) return false;
        this._setCurrentBids();
        return true;
    }

    public rejectPending(action: Action): void {
        if(action.type !== ActionType.reject || action.resolve?.isResolvedExtend) return;
        if(this._thread && this._thread.throw) {
            this._thread.throw({event: action.eventId, error: action.payload});
            this._cancelPendingRequests(action.eventId);
            this._progressBThread(action.eventId, action.payload, true);
            this._logger.logBThreadException(this.id, action.eventId, this._state);
        }
    }

    public hasActiveBid(action: Action): boolean {
        const bid = this._currentBids?.[action.bidType!]?.get(action.eventId);
        if(!bid) return false;
        return true;
    }
    
    public progressRequest(eventCache: EventMap<CachedItem<any>>, action: Action): void {
        const bidType = action.bidType;
        if(bidType === undefined) return;
        const bid = this._currentBids?.[bidType]?.get(action.eventId);
        if(!bid) return;
        if(bidType === BidType.set) {
            setEventCache(eventCache, action.eventId, action.payload);
        }
        this._progressBThread(bid.eventId, action.payload);
        this._logger.logBThreadProgress(this.id, bid, this._state);
    }

    public progressWait(bid: Bid, action: Action): void {
        this._cancelPendingRequests(action.eventId);
        this._progressBThread(bid.eventId, action.payload);
        this._logger.logBThreadProgress(this.id, bid, this._state);
    }

    public progressExtend(action: Action, bid: Bid): ExtendContext {
        const extendContext = new ExtendContext(action.payload);
        this._cancelPendingRequests(action.eventId);
        this._progressBThread(bid.eventId, extendContext);
        this._logger.logBThreadProgress(this.id, bid, this._state);
        extendContext.createPromiseIfNotCompleted();
        return extendContext;
    }

    public destroy(destroyOnReplay?: boolean): void {
        this._pendingExtends.clear();
        this._cancelPendingRequests();
        this._logger.logScaffoldingResult(ScaffoldingResultType.destroyed, this.id);
        if(destroyOnReplay) return;
    }
}