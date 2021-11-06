import { AnyActionWithId, Replay, Behaviors, UpdateCallback } from '../src/index';
import { StagingCB } from '../src/staging';

export function testScenarios(stagingCb: StagingCB, updateCb?: UpdateCallback, initialActionsOrReplay?: Replay | AnyActionWithId[]): Behaviors {
    return new Behaviors({
        stagingCb,
        updateCb,
        doInitialUpdate: true,
        initialActionsOrReplay
    });
}

export function delay<T>(ms: number, value?: T): Promise<T | undefined> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
