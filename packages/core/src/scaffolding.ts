import { BThreadBids } from './bid';
import { BThread, BThreadState, BThreadId, BThreadKey } from './bthread';
import { GetCachedEvent } from './event-cache';
import { Logger } from './logger';
import { BThreadMap } from './bthread-map';
import { Scenario } from './scenario';
import { ResolveActionCB } from './update-loop';
import { BThreadGeneratorFunction } from '.';

export type StagingFunction = (enable: (scenario: Scenario<BThreadGeneratorFunction>, key?: BThreadKey) => BThreadState, getCachedEvent: GetCachedEvent<unknown>) => void;


// enable, disable or delete bThreads
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export function setupScaffolding(
    stagingFunction: StagingFunction,
    bThreadMap: BThreadMap<BThread>,
    bThreadBids: BThreadBids[],
    bThreadStateMap: BThreadMap<BThreadState>,
    getCachedEvent: GetCachedEvent<unknown>,
    resolveActionCB: ResolveActionCB,
    logger: Logger):
() => void {
    const enabledBThreadIds = new BThreadMap<BThreadId>();
    const destroyOnDisableThreadIds = new BThreadMap<BThreadId>();

    function enableBThread([scenarioInfo, generatorFunction, props]: Scenario<BThreadGeneratorFunction>, key?: BThreadKey): BThreadState {
        const bThreadId: BThreadId = {name: scenarioInfo.id, key: key};
        enabledBThreadIds.set(bThreadId, bThreadId);
        let bThread = bThreadMap.get(bThreadId)
        if (bThread) {
            bThread.resetOnPropsChange(props);
        } else {
            bThreadMap.set(bThreadId, new BThread(bThreadId, scenarioInfo, generatorFunction, props, resolveActionCB, logger));
            if(scenarioInfo.destroyOnDisable) destroyOnDisableThreadIds.set(bThreadId, bThreadId);
        }
        bThread = bThreadMap.get(bThreadId)!;
        if(bThread.bThreadBids !== undefined) bThreadBids.push(bThread.bThreadBids);
        return bThread.state;
    }

    function scaffold() {
        bThreadBids.length = 0;
        enabledBThreadIds.clear();
        stagingFunction(enableBThread, getCachedEvent); // do the staging
        bThreadMap.forEach(bThread => {
            if(enabledBThreadIds.has(bThread.id)) {
                bThread.setEnabledState(true);
            } else {
                bThread.setEnabledState(false);
            }
            bThreadStateMap.set(bThread.id, bThread.state);
        });
        if(destroyOnDisableThreadIds.size > 0)
            destroyOnDisableThreadIds.forEach((bThreadId) => {
            if(enabledBThreadIds.has(bThreadId) === false) {
                bThreadMap.get(bThreadId)?.destroy();
                bThreadMap.delete(bThreadId);
                bThreadStateMap.delete(bThreadId);
                destroyOnDisableThreadIds.delete(bThreadId);
            }
        });
        logger.logBThreadStateMap(bThreadStateMap);
    }
    return scaffold;
}
