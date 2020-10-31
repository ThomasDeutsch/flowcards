import { Action } from './action';
import { BThreadBids } from './bid';
import { BThread, BThreadState, GeneratorFn, BThreadInfo, BThreadId } from './bthread';
import { EventMap, EventId, toEventId } from './event-map';
import { CachedItem, GetCachedItem } from './event-cache';
import { Logger, ScaffoldingResultType } from './logger';
import { BThreadMap } from './bthread-map';

export type StagingFunction = (enable: ([bThreadInfo, generatorFn, props]: [BThreadInfo, GeneratorFn, any]) => BThreadState, cached: GetCachedItem) => void;
export type ActionDispatch = (action: Action) => void;

// enable, disable or delete bThreads
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export function setupScaffolding(
    stagingFunction: StagingFunction,
    bThreadMap: BThreadMap<BThread>,
    bThreadBids: BThreadBids[],
    bThreadStateMap: BThreadMap<BThreadState>,
    eventCache: EventMap<CachedItem<any>>,
    dispatch: ActionDispatch,
    logger: Logger): 
(currentActionId: number) => void {
    const enabledBThreadIds = new BThreadMap<BThreadId>();
    const destroyOnDisableThreadIds = new BThreadMap<BThreadId>();
    let bThreadOrderIndex = 0;

    function enableBThread([bThreadInfo, generatorFn, props]: [BThreadInfo, GeneratorFn, any]): BThreadState {
        const bThreadId: BThreadId = {name: bThreadInfo.name, key: bThreadInfo.key};
        enabledBThreadIds.set(bThreadId, bThreadId);
        let bThread = bThreadMap.get(bThreadId)
        if (bThread) {
            bThread.orderIndex = bThreadOrderIndex;
            const wasReset = bThread.resetOnPropsChange(props);
            if(wasReset) logger.logScaffoldingResult(ScaffoldingResultType.reset, bThreadId);
            else logger.logScaffoldingResult(ScaffoldingResultType.enabled, bThreadId);
        } else {
            bThreadMap.set(bThreadId, new BThread(bThreadId, bThreadInfo, bThreadOrderIndex, generatorFn, props, dispatch, logger));
            if(bThreadInfo.destroyOnDisable) destroyOnDisableThreadIds.set(bThreadId, bThreadId);
            logger.logScaffoldingResult(ScaffoldingResultType.init, bThreadId);
        }
        bThread = bThreadMap.get(bThreadId)!;
        if(bThread.currentBids) bThreadBids.push(bThread.currentBids);
        bThreadStateMap.set(bThreadId, bThread.state);
        bThreadOrderIndex++;
        return bThread.state;
    }

    function getCached<T>(event: EventId | string): CachedItem<T> {
        event = toEventId(event);
        return eventCache.get(event)!;
    }

    function scaffold(beforeActionId: number) {
        logger.actionId = beforeActionId;
        bThreadBids.length = 0;
        bThreadOrderIndex = 0;
        enabledBThreadIds.clear();
        stagingFunction(enableBThread, getCached); // do the staging
        bThreadMap.forEach(bThread => {
            if(enabledBThreadIds.has(bThread.id) === false) {
                logger.logScaffoldingResult(ScaffoldingResultType.disabled, bThread.id);
            }
        });
        if(destroyOnDisableThreadIds.size > 0) 
            destroyOnDisableThreadIds.forEach((bThreadId) => {
            if(enabledBThreadIds.has(bThreadId) === false) {
                bThreadMap.get(bThreadId)?.destroy();
                bThreadMap.delete(bThreadId);
                bThreadStateMap.delete(bThreadId);
                destroyOnDisableThreadIds.delete(bThreadId);
                logger.logScaffoldingResult(ScaffoldingResultType.destroyed, bThreadId);
            }
        });
    }
    return scaffold;
}