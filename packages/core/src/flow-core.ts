import { PlacedBid, getPlacedBidsForFlow, BidOrBids } from './bid';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { Logger } from './logger';
import { ResolveActionCB } from './update-loop';
import { EventCore } from './flow-event';
import { FlowGeneratorFunction } from './flow';
import * as utils from './utils';
import { isRequestBid, isSameBid, isSameNameKeyId } from '.';

export type ErrorInfo = {event: NameKeyId, error: any}
export type FlowGenerator = Generator<BidOrBids, void, FlowProgressInfo>;
export interface FlowUtilities {
    key?: string | number;
    resolveExtend: <T>(event: EventCore<T>, value: T) => boolean;
    cancelPending: (event: EventCore) => boolean;
    isExtending: (event: EventCore) => boolean;
    getExtendValue: <T>(event: EventCore<T>) => T | undefined;
}
export interface FlowProgressInfo {
    event: EventCore<any>;
    eventId: NameKeyId;
    flowId: NameKeyId;
    remainingBids?: PlacedBid<any>[];
}

export interface FlowParameters<P> {
    id: NameKeyId,
    generatorFunction: FlowGeneratorFunction<P>;
    resolveActionCB: ResolveActionCB;
    eventMap: NameKeyMap<EventCore>;
    logger: Logger;
    props: P;
    willDestroyOnDisable: boolean;
}

export class FlowCore<P> {
    public readonly id: NameKeyId;
    private readonly _logger: Logger;
    private readonly _eventMap: NameKeyMap<EventCore<any>>
    private _thread: FlowGenerator;
    private _placedBids: PlacedBid[] | undefined;
    private _context: FlowUtilities;
    private _currentProps?: P
    public readonly willDestroyOnDisable: boolean;

    public constructor(params: FlowParameters<P>) {
        this.id = params.id;
        this._logger = params.logger;
        this._eventMap = params.eventMap;
        this._currentProps = params.props;
        this._context = this._createFlowUtilities();
        this._thread = params.generatorFunction.bind(this._context)(params.props);
        const next = this._thread.next();
        this._setPlacedBids(next);
        this.willDestroyOnDisable = params.willDestroyOnDisable;
    }

     // --- private

    private _createFlowUtilities(): FlowUtilities {
        return {
            key:  this.id.key,
            resolveExtend: (event, value) => event.__resolveExtend(this.id, value),
            cancelPending: (event) => event.__cancelPending(),
            isExtending: (event) => event.__isExtending(this.id),
            getExtendValue: (event) => event.__getExtendValue(this.id)
        }
    }

    private _setPlacedBids(next: IteratorResult<BidOrBids, void>): void {
        this.__cancelPending();
        if (next.done) {
            this._placedBids = undefined;
        } else {
            this._placedBids = getPlacedBidsForFlow(this.id, next.value);
        }
    }

    private _processNextBid(bid: PlacedBid<unknown>, error?: any): void {
        let next: IteratorResult<BidOrBids, void>;
        let progressInfo: FlowProgressInfo | undefined;
        if(error !== undefined) {
            next = this._thread.throw(error); // progress Flow to next bid
        }
        else {
            const remainingBids = this._placedBids?.filter(b => {
                return !isSameBid(b, bid);
            });
            progressInfo = {
                event: this._eventMap.get(bid.eventId)!,
                eventId: bid.eventId,
                remainingBids,
                flowId: this.id
            }
            next = this._thread.next(progressInfo); // progress Flow to next bid
        }
        this._setPlacedBids(next);
        this._logger.logReaction(this.id, {...bid, flowId: this.id});
    }

    // --- public

    public get placedBids(): PlacedBid[] | undefined {
        return this._placedBids;
    }

    public resetFlowOnPropsChange(generatorFunction: FlowGeneratorFunction<any>, nextProps?: P): boolean {
        const changedProps = utils.getChangedProps(this._currentProps, nextProps);
        if(changedProps === undefined) return false;
        //TODO: log props change?
        this._currentProps = nextProps;
        this._thread = generatorFunction.bind(this._context)(this._currentProps);
        const next = this._thread.next();
        this._setPlacedBids(next);
        return true;
    }

    public __cancelPending(): void {
        this._placedBids?.filter(isRequestBid).forEach(b => {
            const event = this._eventMap.get(b.eventId);
            if(!isSameNameKeyId(event?.pendingRequestInfo?.flowId, this.id)) return;
            event?.__cancelPending();
            //TODO: log cancel
        })
    }

    public progressBid(bid: PlacedBid): void {
        this._processNextBid(bid);
    }

    public get isCompleted(): boolean {
        return this._placedBids === undefined;
    }

    public throwError(eventId: NameKeyId, error?: unknown): void {
        const bid = this._placedBids?.find(bid => isSameBid(bid, {eventId: eventId, type: 'requestBid'}));
        if(bid === undefined) return;
        this._processNextBid(bid, error);
    }
}
