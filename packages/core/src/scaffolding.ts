import { BThreadBids } from './bid';
import { BThread, BThreadState } from './bthread';
import { Logger } from './logger';
import { EnableScenarioInfo, Scenario } from './scenario';
import { BThreadMap, EventMap } from './update-loop';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { ScenarioEvent } from './scenario-event';
import { InternalDispatch, ResolveAction, ResolveExtendAction } from '.';


export type EnableScenario = (scenario: EnableScenarioInfo<any>) => BThreadState;
export type EnableScenarioEvents = (...events: ScenarioEvent<any>[]) => void;
export type StagingFunction = (enable: EnableScenario, events: EnableScenarioEvents) => void;

export interface ScaffoldingProps {
    stagingFunction: StagingFunction;
    bThreadMap: BThreadMap;
    eventMap: EventMap;
    bThreadBids: BThreadBids[];
    internalDispatch: InternalDispatch;
    logger: Logger;
}

export function setupScaffolding(props: ScaffoldingProps): () => void {
    const resolveActionCb = (action: ResolveAction | ResolveExtendAction) => props.internalDispatch(action);
    const enabledScenarioIds = new NameKeyMap<NameKeyId>();
    const destroyOnDisableThreadIds = new NameKeyMap<NameKeyId>();
    const enabledEventIds = new NameKeyMap<NameKeyId>();

    function enableBThread<P>(info: EnableScenarioInfo<P>): BThreadState {
        enabledScenarioIds.set(info.id, info.id);
        let bThread = props.bThreadMap.get(info.id) as BThread<P>;
        if (bThread) {
            if(info.nextProps) {
                //TODO: log prop change!
                bThread.resetBThread(info.generatorFunction, info.nextProps) ;
            }
        } else {
            bThread = new BThread<P>({
                id: info.id,
                generatorFunction: info.generatorFunction,
                props: info.nextProps!,
                resolveActionCB: resolveActionCb,
                scenarioEventMap: props.eventMap,
                logger: props.logger});
            props.bThreadMap.set(info.id, bThread);
            if(info.destroyOnDisable) destroyOnDisableThreadIds.set(info.id, info.id);
        }
        if(bThread.bThreadBids !== undefined) props.bThreadBids.push(bThread.bThreadBids);
        info.updateStateCb(bThread.state);
        return bThread.state;
    }

    function enableEvents(...events: ScenarioEvent<any>[]): void {
        events.forEach(event => {
            enabledEventIds.set(event.id, event.id);
            if(props.eventMap.has(event.id) === false) {
                event.__setUIActionCb(props.internalDispatch);
                props.eventMap.set(event.id, event);
            }
        });
    }

    function scaffold() {
        props.bThreadBids.length = 0;
        enabledScenarioIds.clear();
        enabledEventIds.clear();
        props.stagingFunction(enableBThread, enableEvents); // do the staging
        // set enable state for scenarios
        props.bThreadMap.allValues?.forEach(bThread => {
            if(enabledScenarioIds.has(bThread.id)) {
                bThread.setEnabled(true);
            } else {
                bThread.setEnabled(false);
            }
        });
        // set enable state for events
        props.eventMap.allValues?.forEach(event => {
            if(enabledEventIds.has(event.id)) {
                event.setIsEnabled(true);
            } else {
                event.setIsEnabled(false);
                props.eventMap.deleteSingle(event.id);
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
    return scaffold;
}
