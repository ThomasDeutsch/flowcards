import { BThreadBids } from './bid';
import { BThread, BThreadState } from './bthread';
import { Logger } from './logger';
import { EnableScenarioInfo, Scenario } from './scenario';
import { BThreadMap, EventMap } from './update-loop';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { ScenarioEvent } from './scenario-event';
import { InternalDispatch, ResolveAction, ResolveExtendAction } from '.';
import { getChangedProps } from './utils';


export type EnableScenario = <P>(...props: P extends void ? [Scenario<P>] : [Scenario<P>, P]) => BThreadState;
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

    const enableBThread: EnableScenario = <P>(...[scenario, scenarioProps]: [Scenario<P>, P] | [Scenario<P>]) => {
        enabledScenarioIds.set(scenario.id, scenario.id);
        let bThread = props.bThreadMap.get(scenario.id) as BThread<P>;
        if (bThread) {
            const changedProps = getChangedProps(scenario.currentProps || undefined, scenarioProps || undefined);
            if(changedProps) {
                scenario.__updateCurrentProps(scenarioProps);
                bThread.resetBThread(scenario.generatorFunction, scenarioProps);
            }
        } else {
            bThread = new BThread<P>({
                id: scenario.id,
                generatorFunction: scenario.generatorFunction,
                props: scenario.currentProps!,
                resolveActionCB: resolveActionCb,
                scenarioEventMap: props.eventMap,
                logger: props.logger});
            props.bThreadMap.set(scenario.id, bThread);
            if(scenario.destroyOnDisable) destroyOnDisableThreadIds.set(scenario.id, scenario.id);
        }
        if(bThread.bThreadBids !== undefined) props.bThreadBids.push(bThread.bThreadBids);
        scenario.__updateState(bThread.state);
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
