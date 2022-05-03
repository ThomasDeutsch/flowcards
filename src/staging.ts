import { FlowCore } from './flow-core';
import { Logger } from './logger';
import { Flow } from './flow';
import { FlowMap } from './scheduler';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { allPlacedBids, AllPlacedBids, BidType, PlacedBid, PlacedRequestBid, PlacedTriggerBid } from './bid';
import { QueueAction, RequestedAsyncAction } from './action';
import { FlowEvent, UserEvent } from './event';

export type EnableFlow = (flow: Flow) => void;
export type StagingCB = (enableFlow: EnableFlow, latestEvent: UserEvent<any,any> | FlowEvent<any,any> | 'initial') => void;
export type RunStaging = () => void;
export type GetPlacedBids = (bidType: BidType, eventId: NameKeyId) => PlacedBid<any>[] | undefined;
export type GetPending = (eventId: NameKeyId) => {pendingBy: NameKeyId | undefined, extendedBy: NameKeyId | undefined};
export type GetFlow = (flowId: NameKeyId) => FlowCore | undefined;

export interface StagingProps {
    stagingCB: StagingCB;
    logger: Logger;
    addToQueue: (action: QueueAction) => void;
}

export class Staging {
    private readonly _flowMap: FlowMap = new NameKeyMap<FlowCore>();
    private readonly _flowBids: PlacedBid<unknown>[] = [];
    private _allPlacedBids?: AllPlacedBids;
    private readonly _nextPendingRequests: [NameKeyId, NameKeyId][] = [];
    private readonly _nextPendingExtends: [NameKeyId, NameKeyId][] = [];
    private readonly _pendingRequests = new NameKeyMap<NameKeyId>();
    private readonly _pendingExtends = new NameKeyMap<NameKeyId>();
    private readonly _enabledFlowIds = new NameKeyMap<NameKeyId>();
    private readonly _logger: Logger;
    private readonly _stagingCB: StagingCB;
    private readonly _addToQueue: (action: QueueAction) => void;

    constructor(props: StagingProps) {
        this._logger = props.logger;
        this._stagingCB = props.stagingCB;
        this._addToQueue = props.addToQueue;
    }

    private _cancelPending(flowId: NameKeyId, eventId: NameKeyId): void {
        this.getFlow(flowId)?.cancelSinglePendingRequest(eventId);
    }

    private _enableFlow: EnableFlow = (flow: Flow) => {
        if(this._enabledFlowIds.has(flow.id)) {
            throw new Error(`${flow.id.name}${flow.id.key ? flow.id.key : ""} enabled more than once`);
        }
        this._enabledFlowIds.set(flow.id, flow.id);
        let flowCore = this._flowMap.get(flow.id);
        if (flowCore === undefined) {
            flowCore = new FlowCore({
                id: flow.id,
                generatorFunction: flow.generatorFunction,
                logger: this._logger,
                willDestroyOnDisable: flow.destroyOnDisable,
                addToQueue: this._addToQueue,
                cancelPending: this._cancelPending.bind(this)
            });
            this._flowMap.set(flow.id, flowCore);
            flow.__setCore(flowCore);
        }

        flowCore.placedBids?.forEach(bid => {
            this._flowBids.unshift(bid);
        });
        flowCore.pendingRequests?.forEach(eventId => {
            this._nextPendingRequests.push([eventId, flowCore!.id]);
        });
        flowCore.pendingExtends?.forEach(eventId => {
            this._nextPendingExtends.push([eventId, flowCore!.id]);
        });
    }

    public run(latestEvent: UserEvent | FlowEvent | 'initial'): void {
        this._flowBids.length = 0;
        this._enabledFlowIds.clear();
        this._stagingCB(this._enableFlow, latestEvent);
        this._flowMap.allValues?.forEach(flow => {
            if(!this._enabledFlowIds.has(flow.id)) {
                flow.cancelAllPendingRequests();
                if(flow.willDestroyOnDisable) {
                    flow.cancelAllPendingExtends();
                    this._flowMap.delete(flow.id);
                }
            }
        });
        this._pendingExtends.clear();
        this._nextPendingExtends.forEach(([eventId, flowId]) => this._pendingExtends.set(eventId, flowId));
        this._nextPendingExtends.length = 0;
        this._pendingRequests.clear();
        this._nextPendingRequests.forEach(([eventId, flowId]) => this._pendingRequests.set(eventId, flowId));
        this._nextPendingRequests.length = 0;
        this._allPlacedBids = allPlacedBids(this._flowBids);
        this._logger.logPlacedBids(this._allPlacedBids);
    }



    public getPlacedBids(type: BidType, eventId: NameKeyId): PlacedBid[] | undefined {
        return this._allPlacedBids?.[type].get(eventId);
    }

    public get orderedRequestingBids(): (PlacedTriggerBid<any, any> | PlacedRequestBid<any, any>)[] | undefined {
        return this._allPlacedBids?.orderedRequestingBids;
    }

    public getFlow(flowId: NameKeyId): FlowCore | undefined {
        return this._flowMap.get(flowId);
    }

    public addPendingRequest(action: RequestedAsyncAction): void {
        this.getFlow(action.flowId)?.addPendingRequest(action);
        this._pendingRequests.set(action.eventId, action.flowId);
    }

    public getPending(eventId: NameKeyId): {pendingBy: NameKeyId | undefined, extendedBy: NameKeyId | undefined} {
        return {
            pendingBy: this._pendingRequests?.get(eventId),
            extendedBy: this._pendingExtends?.get(eventId)
        }
    }

    public removePending(type: 'request' | 'extend', eventId: NameKeyId): void {
        const pendingFlowId = (type === 'request') ? this._pendingRequests.get(eventId) : this._pendingExtends.get(eventId);
        const flow = this._flowMap.get(pendingFlowId);
        if(type === 'request') {
            flow?.cancelSinglePendingRequest(eventId);
            this._pendingRequests.delete(eventId);
        }
        else {
            flow?.removePendingExtend(eventId);
            this._pendingExtends.delete(eventId);
        }
    }

    public addExtend(eventId: NameKeyId, flowId: NameKeyId): void {
        this._pendingExtends.set(eventId, flowId);
    }
}
