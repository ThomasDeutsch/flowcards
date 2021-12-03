import { BThreadCore } from './bthread-core';
import { Logger } from './logger';
import { BThread } from './b-thread';
import { BThreadMap, EventMap } from './update-loop';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { BEvent } from './b-event';
import { BidType, InternalDispatch, PlacedBid, ResolveAction, ResolveExtendAction } from '.';

export type ConnectBThread = <P>(...props: P extends void ? [BThread<P>] : [BThread<P>, P]) => void;
export type ConnectEvents = (...events: (BEvent<any, any> | Record<string, BEvent<any>>)[]) => void;
export type StagingCB = (connectBThread: ConnectBThread, connectEvents: ConnectEvents) => void;
export type RunStaging = () => void;
export type GetBids = (eventId: NameKeyId, bidType: BidType) => PlacedBid<any>[] | undefined;

export interface StagingProps {
    stagingCb: StagingCB;
    bThreadMap: BThreadMap;
    eventMap: EventMap;
    bThreadBids: PlacedBid<unknown>[];
    internalDispatch: InternalDispatch;
    getBids: GetBids;
    logger: Logger;
}

export function setupStaging(props: StagingProps): RunStaging {
    const resolveActionCb = (action: ResolveAction | ResolveExtendAction) => props.internalDispatch(action);
    const connectedBThreadIds = new NameKeyMap<NameKeyId>();
    const connectedEventIds = new NameKeyMap<NameKeyId>();

    const connectBThread: ConnectBThread = <P>(...[bThread, bThreadProps]: [BThread<P>, P] | [BThread<P>]) => {
        connectedBThreadIds.set(bThread.id, bThread.id);
        let bThreadCore = props.bThreadMap.get(bThread.id) as BThreadCore<P>;
        if (bThreadCore !== undefined) {
            bThreadCore.resetBThreadOnPropsChange(bThread.generatorFunction, bThreadProps);
        }
        else {
            bThreadCore = new BThreadCore<P>({
                id: bThread.id,
                generatorFunction: bThread.generatorFunction,
                props: bThreadProps!,
                resolveActionCB: resolveActionCb,
                eventMap: props.eventMap,
                logger: props.logger,
                willDestroyOnDisable: bThread.destroyOnDisable
            });
            props.bThreadMap.set(bThread.id, bThreadCore);
            bThread.__setCore(bThreadCore);
            //if(bThread.destroyOnDisable) destroyOnDisableThreadIds.set(bThread.id, bThread.id);
        }
        bThreadCore.placedBids?.forEach(bid => {
            props.bThreadBids.unshift(bid);
        });
    }

    function connectEvent(event: BEvent<any>) {
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
            if(event instanceof BEvent) {
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
        props.bThreadBids.length = 0;
        connectedBThreadIds.clear();
        connectedEventIds.clear();
        props.stagingCb(connectBThread, connectEvents); // do the staging
        props.eventMap.allValues?.forEach(event => {
            if(!connectedEventIds.has(event.id)) {
                props.eventMap.get(event)?.__unplug();
                props.eventMap.deleteSingle(event);
            }
        });
        props.bThreadMap.allValues?.forEach(bThread => {
            if(!connectedBThreadIds.has(bThread.id)) {
                if(bThread.willDestroyOnDisable) {
                    props.bThreadMap.deleteSingle(bThread.id);
                }
                bThread.__cancelPending();
            }
        })
    }
    return run;
}
