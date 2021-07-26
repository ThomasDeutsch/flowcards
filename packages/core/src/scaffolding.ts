import { BThreadBids } from './bid';
import { BThread, BThreadState } from './bthread';
import { Logger } from './logger';
import { Scenario } from './scenario';
import { BThreadMap, EventMap } from './update-loop';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { ScenarioEvent, ScenarioEventKeyed } from './scenario-event';
import { InternalDispatch, ResolveAction, ResolveExtendAction } from '.';
import * as utils from './utils';


export type EnableScenario = <P>(...props: P extends void ? [Scenario<P>] : [Scenario<P>, P]) => BThreadState;
export type EnableScenarioEvents = (events: ScenarioEvent<any>[] | Record<string, ScenarioEvent<any>>) => void;
export type StagingFunction = (enable: EnableScenario, events: EnableScenarioEvents) => void;
export type UIActionDispatch = (eventId: NameKeyId, payload?: any) => void;


export interface ScaffoldingProps {
    stagingFunction: StagingFunction;
    bThreadMap: BThreadMap;
    eventMap: EventMap;
    bThreadBids: BThreadBids[];
    internalDispatch: InternalDispatch;
    areBThreadsProgressing: () => boolean;
    logger: Logger;
}

export function setupScaffolding(props: ScaffoldingProps): () => void {
    const resolveActionCb = (action: ResolveAction | ResolveExtendAction) => props.internalDispatch(action);
    const uiActionCb = (eventId: NameKeyId, payload?: any): void => {
        props.internalDispatch({
            type: "uiAction",
            eventId: eventId,
            payload: payload
        })
    }
    const enabledScenarioIds = new NameKeyMap<NameKeyId>();
    const destroyOnDisableThreadIds = new NameKeyMap<NameKeyId>();
    const enabledEventIds = new NameKeyMap<NameKeyId>();


    const enableScenario: EnableScenario = <P>(...[scenario, scenarioProps]: [Scenario<P>, P] | [Scenario<P>]) => {
        enabledScenarioIds.set(scenario.id, scenario.id);
        let bThread = props.bThreadMap.get(scenario.id) as BThread<P>;
        if (bThread) {
            const changedProps = utils.getChangedProps(scenario.currentProps || undefined, scenarioProps || undefined);
            if(changedProps) {
                scenario.__updateCurrentProps(scenarioProps);
                bThread.resetBThread(scenario.generatorFunction, scenarioProps!);
            }
        } else {
            bThread = new BThread<P>({
                id: scenario.id,
                generatorFunction: scenario.generatorFunction,
                props: scenarioProps!,
                resolveActionCB: resolveActionCb,
                scenarioEventMap: props.eventMap,
                logger: props.logger});
            props.bThreadMap.set(scenario.id, bThread);
            if(scenario.destroyOnDisable) destroyOnDisableThreadIds.set(scenario.id, scenario.id);
        }
        if(bThread.bThreadBids !== undefined) props.bThreadBids.unshift(bThread.bThreadBids);
        scenario.__updateState(bThread.state);
        return bThread.state;
    }

    function setupEvent(event: ScenarioEvent<any>) {
        enabledEventIds.set(event.id, event.id);
        if(props.eventMap.has(event.id) === false) {
            event.__setUIActionCb(uiActionCb, props.areBThreadsProgressing);
            props.eventMap.set(event.id, event);
            event.enable();
        }
    }

    const enableEvents: EnableScenarioEvents = (events) => {
        utils.executeForEach(setupEvent, events);
    }

    function scaffold() {
        props.bThreadBids.length = 0;
        enabledScenarioIds.clear();
        enabledEventIds.clear();
        props.stagingFunction(enableScenario, enableEvents); // do the staging
        // set enable state for scenarios
        props.bThreadMap.allValues?.forEach(bThread => {
            if(enabledScenarioIds.has(bThread.id)) {
                bThread.setEnabled(true);
            } else {
                bThread.setEnabled(false);
            }
        });
        props.eventMap.allValues?.forEach(event => {
            if(!enabledEventIds.has(event.id)) {
                event.disable();
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
