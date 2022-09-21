import { FlowCore } from './flow-core';
import { Logger } from './logger';
import { Flow } from './flow';
import { FlowMap } from './scheduler';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { allPlacedBids, AllPlacedBids, BidType, PlacedBid, PlacedRequestBid, PlacedTriggerBid } from './bid';
import { QueueAction, RequestedAsyncAction } from './action';
import { FlowEvent, UserEvent } from './event';
import { EventCore } from './event-core';

export type EnableFlow = (flow: Flow, reset?: boolean | 'ResetOnDisable') => void;
export type EnableEvents = (neo: NestedEventObject, reset?: boolean | 'resetOnDisable') => void;
export type StagingCB = (enableEvents: EnableEvents, enableFlow: EnableFlow, latestEvent: UserEvent<any,any> | FlowEvent<any,any> | 'initial') => void;
export type RunStaging = () => void;
export type GetPlacedBids = (bidType: BidType, eventId: NameKeyId) => PlacedBid<any>[] | undefined;
export type GetPending = (eventId: NameKeyId) => {pendingBy: NameKeyId | undefined, extendedBy: NameKeyId | undefined};
export type GetFlow = (flowId: NameKeyId) => FlowCore | undefined;


export type NestedEventObject = UserEvent<any, any> | FlowEvent<any, any> | (FlowEvent<any, any> | UserEvent<any, any>)[] |
    { [key: string]: NestedEventObject };


export function getEvents(neo: NestedEventObject): EventCore<any, any>[] {
    if(Array.isArray(neo)) return neo;
    if(neo instanceof EventCore) return [neo];
    return Object.values(neo).map(getEvents).flat();
}

export interface StagingProps {
    stagingCB: StagingCB;
    logger: Logger;
    addToQueue: (action: QueueAction) => void;
}

export class Staging {
    private readonly _flowMap: FlowMap = new NameKeyMap<FlowCore>();
    private readonly _resetFlowOnDisable = new NameKeyMap<boolean>();
    private readonly _enabledFlowIds = new NameKeyMap<NameKeyId>();
    private readonly _eventMap = new NameKeyMap<FlowEvent<any, any> | UserEvent<any, any>>();
    private readonly _resetEventOnDisable = new NameKeyMap<boolean>();
    private readonly _enabledEventIds = new NameKeyMap<NameKeyId>();
    private readonly _flowBids: PlacedBid<unknown>[] = [];
    private _allPlacedBids?: AllPlacedBids;
    private readonly _nextPendingRequests: [NameKeyId, NameKeyId][] = [];
    private readonly _nextPendingExtends: [NameKeyId, NameKeyId][] = [];
    private readonly _pendingRequests = new NameKeyMap<NameKeyId>();
    private readonly _pendingExtends = new NameKeyMap<NameKeyId>();
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

    private _enableFlow: EnableFlow = (flow, reset) => {
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
                addToQueue: this._addToQueue,
                cancelPending: this._cancelPending.bind(this)
            });
            this._flowMap.set(flow.id, flowCore);
            flow.__setCore(flowCore);
        }
        if(reset === 'ResetOnDisable') {
            this._resetFlowOnDisable.set(flow.id, true);
        }
        if(reset) {
            flowCore.reset();
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

    private _enableEvents: EnableEvents = (neo, reset) => {
        const events = getEvents(neo);
        events.forEach(event => {
            if(this._enabledEventIds.has(event.id)) {
                throw new Error('event in enabled multiple times: ' + event.id)
            }
            this._enabledEventIds.set(event.id, event.id);
            const isConnected = this._eventMap.has(event.id);
            if(!isConnected) {
                event.__connect({
                    addToQueue: this._addToQueue,
                    getPlacedBids: this.getPlacedBids.bind(this),
                    getPending: this.getPending.bind(this)
                });
                this._eventMap.set(event.id, event);
            }
            if(reset === 'resetOnDisable') {
                this._resetEventOnDisable.set(event.id, true);
            } else if(reset) {
                event.__resetValue();
            }
        });
    }

    public run(latestEvent: UserEvent | FlowEvent | 'initial'): void {
        this._flowBids.length = 0;
        this._resetFlowOnDisable.clear();
        this._enabledFlowIds.clear();
        this._enabledEventIds.clear();
        this._resetEventOnDisable.clear();
        this._stagingCB(this._enableEvents, this._enableFlow, latestEvent);
        this._flowMap.allValues?.forEach(flow => {
            if(!this._enabledFlowIds.has(flow.id)) {
                flow.cancelAllPendingRequests();
                if(this._resetFlowOnDisable.get(flow.id)) {
                    flow.cancelAllPendingExtends();
                    this._flowMap.delete(flow.id);
                }
            }
        });
        this._eventMap.allValues?.forEach(event => {
            if(!this._enabledEventIds.has(event.id)) {
                if(this._resetEventOnDisable.has(event.id)) {
                    event.__resetValue();
                }
                event.__disconnect();
            }
        });
        this._pendingExtends.clear();
        this._nextPendingExtends.forEach(([eventId, flowId]) => this._pendingExtends.set(eventId, flowId));
        this._nextPendingExtends.length = 0;
        this._pendingRequests.clear();
        this._nextPendingRequests.forEach(([eventId, flowId]) => this._pendingRequests.set(eventId, flowId));
        this._nextPendingRequests.length = 0;
        this._allPlacedBids = allPlacedBids(this._flowBids);
    }

    public getPlacedBids(type: BidType, eventId: NameKeyId): PlacedBid[] | undefined {
        return this._allPlacedBids?.[type].get(eventId);
    }

    public get allPlacedBids(): AllPlacedBids | undefined {
        return this._allPlacedBids
    }

    public get orderedRequestingBids(): (PlacedTriggerBid<any, any> | PlacedRequestBid<any, any>)[] | undefined {
        return this._allPlacedBids?.orderedRequestingBids;
    }

    public getFlow(flowId: NameKeyId): FlowCore | undefined {
        return this._flowMap.get(flowId);
    }

    public getEvent<P,V>(eventId: NameKeyId): FlowEvent<P,V> | UserEvent<P,V> | undefined {
        return this._eventMap.get(eventId);
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
