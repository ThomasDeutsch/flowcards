
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

export type Scenario = [ScenarioInfo, BThreadGeneratorFunction, Parameters<BThreadGeneratorFunction>[0]]
export type CreateScenario = (generatorProps?: Parameters<BThreadGeneratorFunction>[0]) => Scenario;

export function scenario(info: ScenarioInfo | null, generatorFunction: BThreadGeneratorFunction): CreateScenario {
    const scenarioInfo: ScenarioInfo = {
        id: info?.id || uuidv4(),
        description: info?.description,
        destroyOnDisable: info?.destroyOnDisable,
        autoRepeat: info?.autoRepeat
    };
    return (generatorProps?: Parameters<BThreadGeneratorFunction>[0]) => {
        return [scenarioInfo, generatorFunction, generatorProps]
    }
}