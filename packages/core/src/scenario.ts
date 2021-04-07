
import { BThreadGeneratorFunction, ScenarioInfo } from '.';
import { uuidv4 } from './utils';

export type Scenario<T extends BThreadGeneratorFunction> = [ScenarioInfo, T, Parameters<T>[0]]
export type CreateScenario<T extends BThreadGeneratorFunction> = (generatorProps?: Parameters<T>[0]) => Scenario<T>;

export function scenario<T extends BThreadGeneratorFunction>(info: ScenarioInfo | null, generatorFunction: T): CreateScenario<T> {
    const scenarioInfo: ScenarioInfo = {
        id: info?.id || uuidv4(),
        description: info?.description,
        destroyOnDisable: info?.destroyOnDisable
    };
    return (generatorProps?: Parameters<T>[0]) => {
        return [scenarioInfo, generatorFunction, generatorProps]
    }
}