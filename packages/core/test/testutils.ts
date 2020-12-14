import { ScenariosContext } from '../src/update-loop';
import { Scenarios, Dispatch, UpdateCallback } from '../src/index';
import { StagingFunction } from '../src/scaffolding';

export function testScenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback): [ScenariosContext, Dispatch] {
    const s = new Scenarios(stagingFunction, updateCb, true);
    return [s.initialScenariosContext, s.dispatch];
}

export function delay(ms: number, value?: any): Promise<any> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
