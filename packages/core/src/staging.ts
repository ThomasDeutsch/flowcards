import { BThreadBids } from './bid';
import { BThreadCore, BThreadPublicContext } from './bthread-core';
import { Logger } from './logger';
import { BThread } from './b-thread';
import { BThreadMap, EventMap } from './update-loop';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { BEvent } from './b-event';
import { EventBidInfo, InternalDispatch, ResolveAction, ResolveExtendAction } from '.';

export type EnableScenario = <P>(...props: P extends void ? [BThread<P>] : [BThread<P>, P]) => BThreadPublicContext;
export type ConnectScenarioEvents = (...events: (BEvent<any> | Record<string, BEvent<any>>)[]) => void;
export type StagingCB = (enable: EnableScenario, events: ConnectScenarioEvents) => void;
export type UIActionDispatch = (bThreadId: NameKeyId, eventId: NameKeyId, payload?: any) => void;
export type RunStaging = () => void;

export interface StagingProps {
    stagingCb: StagingCB;
    bThreadMap: BThreadMap;
    eventMap: EventMap;
    bThreadBids: BThreadBids[];
    internalDispatch: InternalDispatch;
    getEventBidInfo: (eventId: NameKeyId) => EventBidInfo;
    logger: Logger;
}

export function setupStaging(props: StagingProps): RunStaging {
    const resolveActionCb = (action: ResolveAction | ResolveExtendAction) => props.internalDispatch(action);
    const uiActionDispatch: UIActionDispatch = (bThreadId: NameKeyId, eventId: NameKeyId, payload?: any): void => {
        props.internalDispatch({
            type: "uiAction",
            eventId: eventId,
            payload: payload,
            bThreadId: bThreadId,

        })
    }
    const enabledScenarioIds = new NameKeyMap<NameKeyId>();
    const destroyOnDisableThreadIds = new NameKeyMap<NameKeyId>();
    const enabledEventIds = new NameKeyMap<NameKeyId>();

    const enableScenario: EnableScenario = <P>(...[scenario, scenarioProps]: [BThread<P>, P] | [BThread<P>]) => {
        enabledScenarioIds.set(scenario.id, scenario.id);
        let bThread = props.bThreadMap.get(scenario.id) as BThreadCore<P>;
        if (bThread) {
            bThread.resetBThreadOnPropsChange(scenario.generatorFunction, scenarioProps)
        } else {
            bThread = new BThreadCore<P>({
                id: scenario.id,
                generatorFunction: scenario.generatorFunction,
                props: scenarioProps!,
                resolveActionCB: resolveActionCb,
                scenarioEventMap: props.eventMap,
                logger: props.logger});
            props.bThreadMap.set(scenario.id, bThread);
            if(scenario.destroyOnDisable) destroyOnDisableThreadIds.set(scenario.id, scenario.id);
        }
        if(bThread.bThreadBids !== undefined) props.bThreadBids.push(bThread.bThreadBids);
        scenario.__updateBThreadContext(bThread.context);
        return bThread.context;
    }

    function connectEvent(event: BEvent<any>) {
        enabledEventIds.set(event.id, event.id);
        if(props.eventMap.has(event.id) === false) {
            event.__connect({
                uiActionDispatch,
                getEventBidInfo: props.getEventBidInfo
            });
            props.eventMap.set(event.id, event);
        }
    }

    const connectEvents: ConnectScenarioEvents = (...events) => {
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
        enabledScenarioIds.clear();
        enabledEventIds.clear();
        props.stagingCb(enableScenario, connectEvents); // do the staging
        props.eventMap.allValues?.forEach(event => {
            if(!enabledEventIds.has(event.id)) {
                props.eventMap.get(event)?.__unplug();
                props.eventMap.deleteSingle(event);
            }
        });
        if(destroyOnDisableThreadIds.size > 0)
            destroyOnDisableThreadIds.forEach((bThreadId) => {
            if(enabledScenarioIds.has(bThreadId) === false) {
                props.bThreadMap.get(bThreadId)?.destroy();
                props.bThreadMap.deleteSingle(bThreadId);
                destroyOnDisableThreadIds.deleteSingle(bThreadId);
            }
        });
    }
    return run;
}
