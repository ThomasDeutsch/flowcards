import { Action, ActionType } from './action';
import { Bid, BidSubType, BidType, BThreadBids, getBidsForBThread } from './bid';
import { EventMap, FCEvent, toEvent } from './event';
import { EventCache, setEventCache } from './event-cache';
import { Logger } from './logger';
import { ActionDispatch } from './update-loop';
import * as utils from './utils';
import { ExtendContext } from './extend-context';

export type BTGen = Generator<Bid | Bid[], void, any>;
export type GeneratorFn = (props: any) => BTGen;
export type BThreadKey = string | number;

export interface BThreadInfo {
    id: string;
    destroyOnDisable?: boolean;
    title?: string;
    key?: BThreadKey;
    description?: string;
}

export interface BTContext {
    key?: BThreadKey;
    section: (newValue: string) => void;
    isPending: (event: string | FCEvent) => boolean;
}

export interface PendingEventInfo {
    event: FCEvent;
    threadId: string;
    extendByThreadId?: string;
    actionIndex: number | null;
}

export interface BThreadState {
    section?: string;
    waits: EventMap<Bid>;
    blocks: EventMap<Bid>;
    requests: EventMap<Bid>;
    extends: EventMap<Bid>;
    pendingRequests: EventMap<PendingEventInfo>;
    isCompleted: boolean;
}

export class BThread {
    public readonly info: BThreadInfo;
    private readonly _logger?: Logger;
    private readonly _dispatch: ActionDispatch;
    private readonly _generatorFn: GeneratorFn;
    private _currentProps: Record<string, any>;
    private _thread: BTGen;
    private _currentBids?: BThreadBids;
    public get currentBids() { return this._currentBids; }
    private _nextBid?: any;
    private _pending: EventMap<PendingEventInfo> = new EventMap();
    public get pending() { return this._pending }
    private _state: BThreadState = {
        section: undefined,
        waits: this._currentBids?.[BidType.wait] || new EventMap(),
        blocks: this._currentBids?.[BidType.block] || new EventMap(),
        requests: this._currentBids?.[BidType.request] || new EventMap(),
        extends: this._currentBids?.[BidType.extend] || new EventMap(),
        pendingRequests: new EventMap<PendingEventInfo>(),
        isCompleted: false
    };
    public get state() { return this._state; }

    public constructor(info: BThreadInfo, generatorFn: GeneratorFn, props: Record<string, any>, dispatch: ActionDispatch, logger?: Logger) {
        this.info = info;
        this._dispatch = dispatch;
        this._generatorFn = generatorFn.bind(this._getBTContext());
        this._logger = logger;
        this._currentProps = props;
        this._thread = this._generatorFn(this._currentProps);
        this._processNextBid();
    }

     // --- private

     private _getBTContext(): BTContext {
        const section = (value: string) => {
            this._state.section = value;
        }
        return {
            key: this.info.key,
            section: section,
            isPending: (event: string | FCEvent) => this._state.pendingRequests.has(toEvent(event))
        };
    }

    private _cancelPending(): EventMap<PendingEventInfo> {
        const clone = this._pending.clone();
        this._pending.clear();
        return clone;
    }

    private _setCurrentBids() {
        this._state.pendingRequests = this._pending.clone();
        this._currentBids = getBidsForBThread(this.info.id, this._nextBid, this._state.pendingRequests);
        this._state.waits = this._currentBids?.[BidType.wait] || new EventMap();
        this._state.blocks = this._currentBids?.[BidType.block] || new EventMap();
        this._state.requests = this._currentBids?.[BidType.request] || new EventMap();
        this._state.extends = this._currentBids?.[BidType.extend] || new EventMap();
    }

    private _processNextBid(returnValue?: any): EventMap<PendingEventInfo> {
        if(this._state.isCompleted) return this._pending;
        const cancelledPending = this._cancelPending();
        const next = this._thread.next(returnValue);
        if (next.done) {
            this._state.isCompleted = true;
            delete this._state.section;
            delete this._nextBid;
            delete this._currentBids;
            this._pending.clear();
        } else {
            this._nextBid = next.value;
            this._setCurrentBids();
        }
        return cancelledPending;
    }

    private _progressBThread(bid: Bid, payload: any, isReject = false): void {
        let returnVal;
        if(!isReject) {
            returnVal = this._currentBids && this._currentBids.withMultipleBids ? [bid.event, payload] : payload;
        }   
        const cancelledPending = this._processNextBid(returnVal);
        this._logger?.logProgress(bid, cancelledPending);
    }



    // --- public

    public resetOnPropsChange(nextProps: any): void {
        const changedProps = utils.getChangedProps(this._currentProps, nextProps);
        if (changedProps === undefined) return;
        // reset
        this._setCurrentBids();
        this._currentProps = nextProps;
        this._state.isCompleted = false;
        delete this._state.section;
        this._thread = this._generatorFn(this._currentProps);
        const cancelledPending = this._processNextBid();
        this._logger?.logReset(this.info.id, changedProps, cancelledPending);
    }

    public addPendingRequest(action: Action, bid: Bid): void {
        const eventInfo: PendingEventInfo = {
            threadId: action.threadId,
            event: action.event,
            extendByThreadId: action.extendByThreadId,
            actionIndex: action.index
        }    
        this._pending.set(action.event, eventInfo);
        this._setCurrentBids();
        const startTime = new Date().getTime();
        action.payload.then((data: any): void => {
            const pendingEventInfo = this._pending.get(action.event);
            if (pendingEventInfo?.actionIndex === action.index) {
                const requestDuration = new Date().getTime() - startTime;
                this._dispatch({
                    index: action.resolvedActionIndex || null, 
                    type: ActionType.resolved,
                    threadId: this.info.id,
                    event: action.event,
                    payload: data,
                    resolve: {
                        requestedActionIndex: action.index!,
                        requestDuration: requestDuration
                    }
                });
            }
        }).catch((e: Error): void => {
            const pendingEventInfo = this._pending.get(action.event);
            if (pendingEventInfo?.actionIndex === action.index) {
                const requestDuration = new Date().getTime() - startTime;
                this._dispatch({
                    index: action.resolvedActionIndex || null,
                    type: ActionType.rejected,
                    threadId: this.info.id,
                    event: action.event,
                    payload: e,
                    resolve: {
                        requestedActionIndex: action.index!,
                        requestDuration: requestDuration
                    }
                });
            }
        });
        this._logger?.logPending(bid, eventInfo);
    }

    public resolvePending(action: Action): boolean {
        if(action.threadId !== this.info.id || action.type !== ActionType.resolved) return false;
        else if(this._pending.deleteSingle(action.event)) {
            this._setCurrentBids();
            return true;
        }
        return false;
    }

    public rejectPending(action: Action): void {
        if(action.threadId !== this.info.id || action.type !== ActionType.rejected) return;
        else if (this._pending.deleteSingle(action.event) && this._thread && this._thread.throw) {
            this._thread.throw({event: action.event, error: action.payload});
            const bid = this._currentBids?.request?.get(action.event);
            if(!bid) return;
            this._progressBThread(bid, action.payload, true);
        }
    }
    
    public progressRequest(eventCache: EventCache, event: FCEvent, payload: any): void {
        const bid = this._currentBids?.request?.get(event) || this._currentBids?.extend?.get(event);
        if(!bid) return;
        if(bid.subType === BidSubType.set) {
            setEventCache(eventCache, event, payload);
        }
        this._progressBThread(bid, payload);
    }

    public progressWait(bid: Bid, actionPayload: any): void {
        if(!bid || bid.guard && !bid.guard(actionPayload)) return;
        this._progressBThread(bid, actionPayload);
    }

    public progressExtend(action: Action, bid: Bid): ExtendContext | undefined {
        if(!bid || bid.guard && !bid.guard(action.payload)) return undefined;
        const extendContext = new ExtendContext(action.payload)
        this._progressBThread(bid, extendContext);
        return extendContext;
    }

    public destroy(): void {
        this._cancelPending();
        this._pending.clear();
        delete this._state;
        delete this._thread;
    }
}