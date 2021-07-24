import { BThreadBids } from './bid';
import { BThread, BThreadState } from './bthread';
import { Logger } from './logger';
import { EnableScenarioInfo } from './scenario';
import { BThreadMap, ResolveActionCB } from './update-loop';
import { NameKeyId, NameKeyMap } from './name-key-map';
import { ScenarioEvent } from './scenario-event';
import { InternalDispatch, ResolveAction, ResolveExtendAction } from '.';


export type EnableScenario = (scenario: EnableScenarioInfo<any>) => BThreadState;
export type EnableScenarioEvents = (...events: ScenarioEvent<any>[]) => void;
export type StagingFunction = (enable: EnableScenario, events: EnableScenarioEvents) => void;


export function setupScaffolding(
    stagingFunction: StagingFunction,
    bThreadMap: BThreadMap,
    scenarioEventMap: NameKeyMap<ScenarioEvent>,
    bThreadBids: BThreadBids[],
    internalDispatch: InternalDispatch,
    logger: Logger):
() => void {
    const enabledScenarioIds = new NameKeyMap<NameKeyId>();
    const destroyOnDisableThreadIds = new NameKeyMap<NameKeyId>();
    const enabledEventIds = new NameKeyMap<NameKeyId>();

    function enableBThread<P>(info: EnableScenarioInfo<P>): BThreadState {
        enabledScenarioIds.set(info.id, info.id);
        let bThread = bThreadMap.get(info.id) as BThread<P>;
        if (bThread) {
            if(info.nextProps) {
                bThread.resetBThread(info.generatorFunction, info.nextProps) ;
            }
        } else {
            bThread = new BThread<P>({
                id: info.id,
                generatorFunction: info.generatorFunction,
                props: info.nextProps,
                resolveActionCB: (action: ResolveAction | ResolveExtendAction) => internalDispatch(action),
                scenarioEventMap,
                logger});
            bThreadMap.set(info.id, bThread);
            if(info.destroyOnDisable) destroyOnDisableThreadIds.set(info.id, info.id);
        }
        if(bThread.bThreadBids !== undefined) bThreadBids.push(bThread.bThreadBids);
        info.updateStateCb(bThread.state);
        return bThread.state;
    }

    function enableEvents(...events: ScenarioEvent<any>[]): void {
        events.forEach(event => {
            enabledEventIds.set(event.id, event.id);
            if(scenarioEventMap.has(event.id) === false) {
                event.__setUIActionCb(internalDispatch);
                scenarioEventMap.set(event.id, event);
            }
        });
    }

    function scaffold() {
        bThreadBids.length = 0;
        enabledScenarioIds.clear();
        enabledEventIds.clear();
        stagingFunction(enableBThread, enableEvents); // do the staging
        // set enable state for scenarios
        bThreadMap.allValues?.forEach(bThread => {
            if(enabledScenarioIds.has(bThread.id)) {
                bThread.setEnabled(true);
            } else {
                bThread.setEnabled(false);
            }
        });
        // set enable state for events
        scenarioEventMap.allValues?.forEach(event => {
            if(enabledEventIds.has(event.id)) {
                event.setEnabled(true);
            } else {
                event.setEnabled(false);
                scenarioEventMap.deleteSingle(event.id);
            }
        });
        if(destroyOnDisableThreadIds.size > 0)
            destroyOnDisableThreadIds.forEach((bThreadId) => {
            if(enabledScenarioIds.has(bThreadId) === false) {
                bThreadMap.get(bThreadId)?.destroy();
                bThreadMap.deleteSingle(bThreadId);
                destroyOnDisableThreadIds.deleteSingle(bThreadId);
            }
        });
    }
    return scaffold;
}
