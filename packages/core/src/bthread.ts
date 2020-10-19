import { Action, ActionType } from './action';
import { Bid, BidType, BThreadBids, getBidsForBThread } from './bid';
import { EventMap, EventId, toEventId } from './event-map';
import { setEventCache, CachedItem } from './event-cache';
import { ActionDispatch } from './update-loop';
import * as utils from './utils';
import { ExtendContext } from './extend-context';
import { BThreadMap } from './bthread-map';
import { ActionLog } from './action-log';

export type BTGen = Generator<Bid | (Bid | null)[] | null, void, any>;
export type GeneratorFn = (props: any) => BTGen;
export type BThreadKey = string | number;
export type BThreadId = {name: string; key?: BThreadKey};

export interface BThreadInfo {
    name: string;
    key?: BThreadKey;
    destroyOnDisable?: boolean;
    cancelPendingOnDisable?: boolean;
    description?: string;
}

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
    waits: EventMap<Bid>;
    blocks: EventMap<Bid>;
    requests: EventMap<Bid>;
    extends: EventMap<Bid>;
    pending: EventMap<PendingEventInfo>;
    destroyOnDisable?: boolean;
    cancelPendingOnDisable?: boolean;
    isCompleted: boolean;
    description?: string;
}

export class BThread {
    public readonly idString: string;
    public readonly id: BThreadId;
    private readonly _dispatch: ActionDispatch;
    private readonly _generatorFn: GeneratorFn;
    private readonly _actionLog: ActionLog;
    private _currentProps: Record<string, any>;
    private _thread: BTGen;
    private _currentBids?: BThreadBids;
    public get currentBids() { return this._currentBids; }
    private _nextBid?: any;
    private _pendingRequests: EventMap<PendingEventInfo> = new EventMap();
    private _pendingExtends: EventMap<PendingEventInfo> = new EventMap();
    private _state: BThreadState;
    public get state() { return this._state; }

    public constructor(id: BThreadId, info: BThreadInfo, generatorFn: GeneratorFn, props: Record<string, any>, dispatch: ActionDispatch, actionLog: ActionLog) {
        this.id = id;
        this._state = {
            id: id,
            destroyOnDisable: info.destroyOnDisable,
            cancelPendingOnDisable: info.cancelPendingOnDisable,
            description: info.description,
            section: undefined,
            waits: this._currentBids?.[BidType.wait] || new EventMap(),
            blocks: this._currentBids?.[BidType.block] || new EventMap(),
            requests: this._currentBids?.[BidType.request] || new EventMap(),
            extends: this._currentBids?.[BidType.extend] || new EventMap(),
            pending: new EventMap(),
            isCompleted: false
        };
        this.idString = BThreadMap.toIdString(id);
        this._dispatch = dispatch;
        this._generatorFn = generatorFn.bind(this._getBThreadContext());
        this._currentProps = props;
        this._thread = this._generatorFn(this._currentProps);
        this._actionLog = actionLog;
        this._processNextBid();
        this._actionLog.logBThreadInit(this.id, this._state, this._state.section);
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

    private _setCurrentBids() {
        this._state.pending = this._pendingRequests.clone().merge(this._pendingExtends);
        this._currentBids = getBidsForBThread(this.id, this._nextBid, this._state.pending);
        this._state.waits = this._currentBids?.[BidType.wait] || new EventMap();
        this._state.blocks = this._currentBids?.[BidType.block] || new EventMap();
        this._state.requests = this._currentBids?.[BidType.request] || new EventMap();
        this._state.extends = this._currentBids?.[BidType.extend] || new EventMap();
    }

    private _processNextBid(returnValue?: any): void {
        const next = this._thread.next(returnValue); // progress BThread to next bid
        if (next.done) {
            this._state.isCompleted = true;
            delete this._state.section;
            delete this._nextBid;
            delete this._currentBids;
        } else {
            this._nextBid = next.value;
            this._setCurrentBids();
        }
    }

    private _progressBThread(bid: Bid | 'rejected', payload: any, isReject = false): void { 
        // null will be passed as a bid, if a request is rejected
        let returnVal;
        if(!isReject) {
            returnVal = Array.isArray(this._nextBid) ? [bid === 'rejected' ? bid : bid.eventId, payload] : payload;
        }
        this._pendingRequests.clear();
        const sectionBeforeProgression = this._state.section;
        this._processNextBid(returnVal);
        const nextSection = (this._state.section && this._state.section !== sectionBeforeProgression) ? this._state.section : undefined;
        this._actionLog.logBThreadProgress(this.id, bid, this._state, nextSection);
    }

    private _cancelAllPendingRequests(action: Action): void {
        const pending = this._pendingRequests.get(action.eventId);
        if(pending?.actionId === action.id) {
            // TODO: log cancelled requests. 
            // as far as i can tell, this info should only be presented in logs, and is not relevant to anything else.
            // const canceledRequests = this._pendingRequests.allValues?.map(info => info.actionId).filter(id => id !== pending.actionId);
            // TODO: this._actionLog.logCancelledRequests(action.id, this.id, canceledRequests);
            this._pendingRequests.clear();
            this._pendingRequests.set(action.eventId, pending);
        }
    }

    private _deletePending(action: Action): boolean {
        if(action.resolve?.isResolvedExtend) {
            return this._pendingExtends.deleteSingle(action.eventId);
        }
        else {
            return this._pendingRequests.deleteSingle(action.eventId);
        }
    }

    // --- public

    public resetOnPropsChange(nextProps: any): void {
        const changedPropNames = utils.getChangedProps(this._currentProps, nextProps);
        if (changedPropNames === undefined) return;
        // reset
        this._pendingExtends = new EventMap();
        // this._setCurrentBids();
        this._currentProps = nextProps;
        this._state.isCompleted = false;
        delete this._state.section;
        this._thread = this._generatorFn(this._currentProps);
        this._pendingRequests.clear();
        this._pendingExtends.clear();
        const sectionBeforeProgression = this._state.section;
        this._processNextBid(); // progress BThread
        const nextSection = (this._state.section && this._state.section !== sectionBeforeProgression) ? this._state.section : undefined;
        this._actionLog.logBThreadReset(this.id, changedPropNames, this._state, nextSection);
        
    }

    public addPendingEvent(action: Action, isExtendPromise: boolean): void {
        const eventInfo: PendingEventInfo = {
            bThreadId: action.bThreadId,
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
        action.payload.then((data: any): void => {
            if(!this._thread) return; // thread was deleted
            const pendingEventInfo = isExtendPromise ? this._pendingExtends.get(action.eventId) : this._pendingRequests.get(action.eventId);
            if(pendingEventInfo === undefined || pendingEventInfo.actionId === null) return;
            if(pendingEventInfo.actionId !== action.id) return;
            if (pendingEventInfo.actionId === action.id) {
                if(!isExtendPromise) this._cancelAllPendingRequests(action);
                const requestDuration = new Date().getTime() - startTime;
                this._dispatch({
                    id: action.resolveActionId || null, 
                    type: ActionType.resolved,
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
                this._dispatch({
                    id: action.resolveActionId || null,
                    type: ActionType.rejected,
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
        if(action.type !== ActionType.rejected || action.resolve?.isResolvedExtend) return;
        if(this._thread && this._thread.throw) {
            this._thread.throw({event: action.eventId, error: action.payload});
            this._progressBThread('rejected', action.payload, true);
        }
    }

    
    public progressRequest(eventCache: EventMap<CachedItem<any>>, action: Action): void {
        const bidType = action.bidType;
        if(bidType === undefined) return;
        const bid = this._currentBids?.[bidType]?.get(action.eventId);
        if(!bid) return;
        if(bidType === BidType.set) {
            setEventCache(eventCache, action.eventId, action.payload);
        }
        this._progressBThread(bid, action.payload);
    }

    public progressWait(bid: Bid, action: Action): void {
        this._progressBThread(bid, action.payload);
    }

    public progressExtend(action: Action, bid: Bid): ExtendContext {
        const extendContext = new ExtendContext(action.payload);
        this._progressBThread(bid, extendContext);
        extendContext.createPromiseIfNotCompleted();
        return extendContext;
    }

    public cancelPending() {
        this._pendingRequests.clear();
        this._pendingExtends.clear();
    }

    public destroy(): void {
        this.cancelPending();
    }
}