import { AnyAction, ResolveExtendAction, getResolveAction, getResolveExtendAction, RequestedAction } from './action';
import { PlacedBid, BidType, BThreadBids, getPlacedBidsForBThread, BidOrBids, BidsByType, toBidsByType } from './bid';
import { EventMap, EventId, toEventId, sameEventId } from './event-map';
import * as utils from './utils';
import { ExtendContext } from './extend-context';
import { Logger, BThreadReactionType } from './logger';
import { toExtendPendingBid, PendingBid } from './pending-bid';
import { ResolveActionCB } from './update-loop';
import { ReactionCheck } from './validation';
import { ScenarioEvent } from './scenario-event';
import { Bid } from '.';

export type ErrorInfo = {event: EventId, error: any}
export type BThreadGenerator = Generator<BidOrBids, void, ScenarioProgressInfo>;
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
    getKey: () => BThreadKey | undefined;
    section: (newValue: string) => void;
    clearSection: () => void;
    isPending: (event: string | EventId) => boolean;
}

export interface ScenarioProgressInfo {
    event: ScenarioEvent;
    eventId: EventId;
    remainingBids?: Bid[];
}

export interface BThreadState {
    id: BThreadId;
    isEnabled: boolean;
    section?: string;
    destroyOnDisable?: boolean;
    isCompleted: boolean;
    description?: string;
    progressionCount: number;
    pendingBids: EventMap<PendingBid>;
    bids: BidsByType;
    cancelledBids?: EventMap<PlacedBid>;
    currentProps?: BThreadProps;
}

export function isSameBThreadId(a?: BThreadId, b?: BThreadId): boolean {
    if(!a || !b) return false;
    return a.name === b.name && a.key === b.key;
}

export class BThread {
    public readonly id: BThreadId;
    private readonly _resolveActionCB: ResolveActionCB;
    private readonly _generatorFunction: BThreadGeneratorFunction;
    private readonly _logger: Logger;
    private readonly _destroyOnDisable: boolean;
    private readonly _description?: string;
    private readonly _event: EventMap<ScenarioEvent>
    private _currentProps: BThreadProps;
    private _thread: BThreadGenerator;
    private _placedBids: PlacedBid[] = [];
    public get bThreadBids(): BThreadBids | undefined {
        if(this._state.pendingBids.size() === 0 && this._placedBids.length === 0) return undefined
        return {pendingBidMap: this._state.pendingBids, placedBids: this._placedBids.reverse() }}
    private _nextBidOrBids?: BidOrBids;
    private _pendingRequests: EventMap<PendingBid> = new EventMap();
    private _pendingExtends: EventMap<PendingBid> = new EventMap();
    private _state: BThreadState;
    public get state(): BThreadState { return this._state }

    private _createState(): BThreadState {
        return {
            id: this.id,
            isEnabled: true,
            destroyOnDisable: this._destroyOnDisable,
            description: this._description,
            currentProps: this._currentProps,
            section: undefined,
            isCompleted: false,
            progressionCount: 0,
            pendingBids: new EventMap(),
            bids: {}
        };
    }

    public constructor(id: BThreadId, scenarioInfo: ScenarioInfo, generatorFunction: BThreadGeneratorFunction, props: BThreadProps, resolveActionCB: ResolveActionCB, scenarioEventMap: EventMap<ScenarioEvent>, logger: Logger) {
        this.id = id;
        this._currentProps = props;
        this._destroyOnDisable = !!scenarioInfo.destroyOnDisable;
        this._description = scenarioInfo.description;
        this._logger = logger;
        this._event = scenarioEventMap;
        this._resolveActionCB = resolveActionCB;
        this._generatorFunction = generatorFunction.bind(this._getBThreadContext());
        this._state = this._createState();
        this._thread = this._generatorFunction(this._currentProps);
        const next = this._thread.next();
        this._nextBidOrBids = next.value as BidOrBids;
        this._setCurrentBids();
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
        const getKey = () => {
            return this._state.id.key;
        }
        return {
            getKey: getKey,
            section: section,
            clearSection: removeSection,
            isPending: (event: string | EventId) => this._isPending(event),
        };
    }

    private _isPending(eventId: EventId | string): boolean {
        return this._pendingRequests.has(eventId) || this._pendingExtends.has(eventId);
    }

    private _setCurrentBids(): void {
        this._placedBids = getPlacedBidsForBThread(this.id, this._nextBidOrBids);
        this._pendingRequests.forEach(requestBidEventId => {         // remove all pending requests, that are not placed.
            if(!this._placedBids.some(placedBid => sameEventId(requestBidEventId, placedBid.eventId))) {
                this._pendingRequests.deleteSingle(requestBidEventId);
            }
        })
        const allPendingBids = this._pendingRequests.clone().merge(this._pendingExtends);
        this._state.pendingBids = allPendingBids;
        this._state.bids = toBidsByType({pendingBidMap: allPendingBids, placedBids: this._placedBids})
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


    private _processNextBid(progressedOnBid: PlacedBid, eventId: EventId, error?: ErrorInfo): void {
        let next: IteratorResult<BidOrBids, void>;
        if(error) {
            next = this._thread.throw(error); // progress BThread to next bid
        } else {
            const progressInfo: ScenarioProgressInfo = {
                event: this._event.get({name: eventId.name})!,
                eventId: eventId,
                remainingBids: this._placedBids.filter(bid => !sameEventId(bid.eventId, progressedOnBid.eventId))
            }
            next = this._thread.next(progressInfo); // progress BThread to next bid
        }
        this._state.progressionCount++;
        if (next.done) {
            this._pendingRequests.clear();
            delete this._nextBidOrBids;
            this._placedBids = [];
            this._state.isCompleted = true;
            this._state.bids = {};
            this._state.pendingBids = new EventMap();
        } else {
            this._nextBidOrBids = next.value;
        }
        this._setCurrentBids(); // look at all pending requests and remove all without current bids
        this._logger.logReaction(BThreadReactionType.progress ,this.id, progressedOnBid);
    }

    private _resetBThread(props: BThreadProps) {
        this._cancelPendingRequests();
        this._pendingExtends = new EventMap();
        this._currentProps = props;
        this._state = this._createState();
        this._thread = this._generatorFunction(this._currentProps);
        const next = this._thread.next();
        this._nextBidOrBids = next.value as BidOrBids;
        this._setCurrentBids();
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

    public setEnabledState(isEnabled: boolean): void {
        this._state.isEnabled = isEnabled;
    }

    public getCurrentBid(bidType: BidType, eventId: EventId): PlacedBid | undefined {
        return this._placedBids.find(placedBid => placedBid.type === bidType && sameEventId(placedBid.eventId, eventId))
    }

    public resetOnPropsChange(nextProps: BThreadProps): void {
        const changedPropNames = utils.getChangedProps(this._currentProps, nextProps);
        if (changedPropNames === undefined) return;
        this._resetBThread(nextProps);
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

    public cancelPending(eventId: EventId | string, message: string): boolean {
        const pendingBid = this._pendingRequests.get(toEventId(eventId));
        if(this._isValidBid(pendingBid) === false) return false;
        const response = getResolveAction("rejectAction", pendingBid!, message);
        this._resolveActionCB(response);
        return true;
    }

    public rejectPending(eventId: EventId, error: any): ReactionCheck {
        const bid = this._pendingRequests.get(eventId);
        if(bid === undefined) return ReactionCheck.BThreadWithoutMatchingBid;
        if(!this._pendingRequests.deleteSingle(eventId)) return ReactionCheck.PendingBidNotFound;
        this._pendingRequests.clear();
        this._processNextBid(bid, eventId, {event: eventId, error: error});
        this._logger.logReaction(BThreadReactionType.error, this.id);
        this._setCurrentBids();
        return ReactionCheck.OK;
    }

    public progressResolved(eventId: EventId, payload: any): ReactionCheck {
        const bid = this._pendingRequests.get(eventId);
        if(bid === undefined) return ReactionCheck.RequestingBThreadNotFound;
        this._event.get({name: eventId.name})?.__setValue(payload, eventId.key);
        this._processNextBid(bid, eventId);
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

    public progressRequested(bidType: BidType, eventId: EventId, payload: any): ReactionCheck {
        const bid = this.getCurrentBid(bidType, eventId);
        if(bid === undefined) return ReactionCheck.BThreadWithoutMatchingBid;
        this._event.get({name: eventId.name})?.__setValue(payload, eventId.key);
        this._processNextBid(bid, eventId);
        return ReactionCheck.OK;
    }

    public progressWait(bid: PlacedBid, eventId: EventId): void {
        this._processNextBid(bid, eventId);
        this._logger.logReaction(BThreadReactionType.progress ,this.id, bid);
    }

    public progressExtend(extendedAction: AnyAction): ExtendContext | undefined {
        const bid = this.getCurrentBid('extendBid', extendedAction.eventId);
        if(bid === undefined) return undefined;
        const extendContext = new ExtendContext(extendedAction.payload);
        this._processNextBid(bid, extendedAction.eventId); //TODO: is this correct?
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
    }
}
