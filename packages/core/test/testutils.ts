import { ScenariosContext } from '../src/update-loop';
import { scenarios } from '../src/index';
import { StagingFunction } from '../src/scaffolding';
export type UpdateCallback = (scenario: ScenariosContext) => any;

export function testScenarios(stagingFunction: StagingFunction, updateCb?: UpdateCallback) {
    return scenarios(stagingFunction, updateCb, true);
}

export function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
