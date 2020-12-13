
import { Bid } from './bid';
import { uuidv4 } from './utils';

export type BThreadGenerator = Generator<Bid | (Bid | null)[] | null, void, any>;
export type BThreadGeneratorFunction = (props: any) => BThreadGenerator;
export interface ScenarioInfo {
    id: string;
    destroyOnDisable?: boolean;
    description?: string;
    autoRepeat?: boolean;
}

export type Scenario<T extends BThreadGeneratorFunction> = [ScenarioInfo, T, Parameters<T>[0]]
export type CreateScenario<T extends BThreadGeneratorFunction> = (generatorProps?: Parameters<T>[0]) => Scenario<T>;

export function scenario<T extends BThreadGeneratorFunction>(info: ScenarioInfo | null, generatorFunction: T): CreateScenario<T> {
    const scenarioInfo: ScenarioInfo = {
        id: info?.id || uuidv4(),
        description: info?.description,
        destroyOnDisable: info?.destroyOnDisable,
        autoRepeat: info?.autoRepeat
    };
    return (generatorProps?: Parameters<T>[0]) => {
        return [scenarioInfo, generatorFunction, generatorProps]
    }
}