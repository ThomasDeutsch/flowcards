import { ScenariosContext } from '../src/update-loop';
import { AnyActionWithId, Scenarios, UpdateCallback } from '../src/index';
import { StagingFunction } from '../src/scaffolding';

export function testScenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback, replay?: AnyActionWithId[]): ScenariosContext {
    const s = new Scenarios(stagingFunction, updateCb, true, replay);
    return s.initialScenariosContext;
}

export function delay(ms: number, value?: any): Promise<any> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
