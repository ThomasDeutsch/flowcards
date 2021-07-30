import { ScenariosContext } from '../src/update-loop';
import { AnyActionWithId, Scenarios, UpdateCallback } from '../src/index';
import { StagingFunction } from '../src/staging';

export function testScenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback, replay?: AnyActionWithId[]): ScenariosContext {
    const s = new Scenarios(stagingFunction, updateCb, true, replay);
    return s.initialScenariosContext;
}

export function delay<T>(ms: number, value?: T): Promise<T | undefined> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
