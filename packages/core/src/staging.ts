import { BThreadBids } from './bid';
import { BThread, BThreadPublicContext } from './bthread';
import { Logger } from './logger';
import { Scenario } from './scenario';
import { BThreadMap, EventMap } from './update-loop';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { ScenarioEvent } from './scenario-event';
import { AllPlacedBids, InternalDispatch, ResolveAction, ResolveExtendAction } from '.';
import * as utils from './utils';


export type EnableScenario = <P>(...props: P extends void ? [Scenario<P>] : [Scenario<P>, P]) => BThreadPublicContext;
export type EnableScenarioEvents = (...events: ScenarioEvent<any>[]) => void;
export type StagingFunction = (enable: EnableScenario, events: EnableScenarioEvents) => void;
export type UIActionDispatch = (eventId: NameKeyId, payload?: any) => void;
export type RunStaging = () => void;

export interface StagingProps {
    stagingFunction: StagingFunction;
    bThreadMap: BThreadMap;
    eventMap: EventMap;
    bThreadBids: BThreadBids[];
    internalDispatch: InternalDispatch;
    areBThreadsProgressing: () => boolean;
    logger: Logger;
}

export function setupStaging(props: StagingProps): RunStaging {
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
        scenario.__updateBThreadContext(bThread.context);
        return bThread.context;
    }


    const enableEvents: EnableScenarioEvents = (...events) => {
        events.forEach(event => {
            enabledEventIds.set(event.id, event.id);
            if(props.eventMap.has(event.id) === false) {
                event.__setup(uiActionCb, props.areBThreadsProgressing);
                props.eventMap.set(event.id, event);
                event.enable();
            }
        });
    }

    function run() {
        props.bThreadBids.length = 0;
        enabledScenarioIds.clear();
        enabledEventIds.clear();
        props.stagingFunction(enableScenario, enableEvents); // do the staging
        // set enable state for scenarios
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
    return run;
}
