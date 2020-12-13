import { ScenariosContext } from '../src/update-loop';
import { Scenarios, DispatchActions, UpdateCallback } from '../src/index';
import { StagingFunction } from '../src/scaffolding';

export function testScenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback): [ScenariosContext, DispatchActions] {
    const s = new Scenarios(stagingFunction, updateCb, true);
    return [s.initialScenariosContext, s.dispatchActions];
}

export function delay(ms: number, value?: any): Promise<any> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
