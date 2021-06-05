import { ScenariosContext } from '../src/update-loop';
import { Scenarios, UpdateCallback } from '../src/index';
import { StagingFunction } from '../src/scaffolding';
import { StartReplay } from  '../src/index';

export function testScenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback): [ScenariosContext, StartReplay] {
    const s = new Scenarios(stagingFunction, updateCb, true);
    return [s.initialScenariosContext, s.startReplay];
}

export function delay(ms: number, value?: any): Promise<any> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
