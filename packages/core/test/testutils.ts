import { AnyActionWithId, Replay, Scenarios, UpdateCallback } from '../src/index';
import { StagingFunction } from '../src/staging';

export function testScenarios(stagingFunction: StagingFunction, updateCB?: UpdateCallback, initialActionsOrReplay?: Replay | AnyActionWithId[]): Scenarios {
    return new Scenarios({
        stagingFunction,
        updateCB,
        doInitialUpdate: true,
        initialActionsOrReplay
    });
}

export function delay<T>(ms: number, value?: T): Promise<T | undefined> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
