import { GeneratorFn, BThreadKey, ScenarioInfo } from './bthread';
import { uuidv4 } from './utils';

export type ScenarioSetupInfo = Omit<ScenarioInfo, 'key'>;
export type Scenario<T extends GeneratorFn> = (generatorProps?: Parameters<T>[0], key?: BThreadKey) => [ScenarioInfo, GeneratorFn, Parameters<T>[0]];

export function scenario<T extends GeneratorFn>(info: ScenarioSetupInfo | null, gen: T): Scenario<T> {
    const i: ScenarioInfo = {
        id: info?.id || uuidv4(),
        description: info?.description,
        destroyOnDisable: info?.destroyOnDisable,
        autoRepeat: info?.autoRepeat
    };
    return (generatorProps?: Parameters<T>[0], key?: BThreadKey) => {
        i.key = key;
        return [i, gen, generatorProps]
    }
}