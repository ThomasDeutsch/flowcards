import { FlowCore } from './flow-core';
import { Logger } from './logger';
import { Flow } from './flow';
import { FlowMap, EventMap } from './update-loop';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { EventCore } from './flow-event';
import { BidType, InternalDispatch, PlacedBid, ResolveAction, ResolveExtendAction } from '.';

export type ConnectFlow = <P>(...props: P extends void ? [Flow<P>] : [Flow<P>, P]) => void;
export type ConnectEvents = (...events: (EventCore<any, any> | Record<string, EventCore<any>>)[]) => void;
export type StagingCB = (connectFlow: ConnectFlow, connectEvents: ConnectEvents) => void;
export type RunStaging = () => void;
export type GetBids = (eventId: NameKeyId, bidType: BidType) => PlacedBid<any>[] | undefined;

export interface StagingProps {
    stagingCb: StagingCB;
    flowMap: FlowMap;
    eventMap: EventMap;
    flowBids: PlacedBid<unknown>[];
    internalDispatch: InternalDispatch;
    getBids: GetBids;
    logger: Logger;
}

export function setupStaging(props: StagingProps): RunStaging {
    const resolveActionCb = (action: ResolveAction | ResolveExtendAction) => props.internalDispatch(action);
    const connectedFlowIds = new NameKeyMap<NameKeyId>();
    const connectedEventIds = new NameKeyMap<NameKeyId>();

    const connectFlow: ConnectFlow = <P>(...[flow, flowProps]: [Flow<P>, P] | [Flow<P>]) => {
        connectedFlowIds.set(flow.id, flow.id);
        let flowCore = props.flowMap.get(flow.id) as FlowCore<P>;
        if (flowCore !== undefined) {
            flowCore.resetFlowOnPropsChange(flow.generatorFunction, flowProps);
        }
        else {
            flowCore = new FlowCore<P>({
                id: flow.id,
                generatorFunction: flow.generatorFunction,
                props: flowProps!,
                resolveActionCB: resolveActionCb,
                eventMap: props.eventMap,
                logger: props.logger,
                willDestroyOnDisable: flow.destroyOnDisable
            });
            props.flowMap.set(flow.id, flowCore);
            flow.__setCore(flowCore);
            //if(flow.destroyOnDisable) destroyOnDisableThreadIds.set(flow.id, flow.id);
        }
        flowCore.placedBids?.forEach(bid => {
            props.flowBids.push(bid);
        });
    }

    function connectEvent(event: EventCore<any>) {
        connectedEventIds.set(event.id, event.id);
        if(props.eventMap.has(event.id) === false) {
            event.__connect({
                internalDispatch: props.internalDispatch,
                getBids: props.getBids
            });
            props.eventMap.set(event.id, event);
        }
    }

    const connectEvents: ConnectEvents = (...events) => {
        events.forEach(event => {
            if(event instanceof EventCore) {
                connectEvent(event);
            }
            else {
                Object.values(event).forEach(e => {
                    connectEvent(e);
                })
            }
        });
    }

    function run() {
        props.flowBids.length = 0;
        connectedFlowIds.clear();
        connectedEventIds.clear();
        props.stagingCb(connectFlow, connectEvents); // do the staging
        props.eventMap.allValues?.forEach(event => {
            if(!connectedEventIds.has(event.id)) {
                props.eventMap.get(event)?.__unplug();
                props.eventMap.delete(event);
            }
        });
        props.flowMap.allValues?.forEach(flow => {
            if(!connectedFlowIds.has(flow.id)) {
                if(flow.willDestroyOnDisable) {
                    props.flowMap.delete(flow.id);
                }
                flow.__cancelPending();
            }
        })
    }
    return run;
}
