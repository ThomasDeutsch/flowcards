import { GeneratorFn, BThreadKey, BThreadInfo } from './bthread';
import { uuidv4 } from './utils';

export function flow<T extends GeneratorFn>(info: BThreadInfo | null, gen: T): (generatorProps?: Parameters<T>[0], flowKey?: BThreadKey) => [BThreadInfo, GeneratorFn, Parameters<T>[0]] {
    const i: BThreadInfo = {
        name: info?.name || uuidv4(),
        description: info?.description,
        key: info?.key,
        destroyOnDisable: info?.destroyOnDisable || false
    };
    return (generatorProps?: Parameters<T>[0], key?: BThreadKey): [BThreadInfo, GeneratorFn, Parameters<T>[0]] => {
        i.key = key;
        return [i, gen, generatorProps]
    }
}