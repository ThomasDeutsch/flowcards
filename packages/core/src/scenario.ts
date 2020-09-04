import { GeneratorFn, BThreadKey, BThreadInfo } from './bthread';
import { uuidv4 } from './utils';

export function flow<T extends GeneratorFn>(info: BThreadInfo | null, gen: T): (generatorProps?: Parameters<T>[0], flowKey?: BThreadKey) => [BThreadInfo, GeneratorFn, Parameters<T>[0]] {
    const i: BThreadInfo = {
        name: info?.name || uuidv4(),
        title: info?.title,
        key: info?.key,
        cancelPendingOnDisable: info?.cancelPendingOnDisable || false,
        destroyOnDisable: info?.destroyOnDisable || false
    };
    return (generatorProps?: Parameters<T>[0], key?: BThreadKey): [BThreadInfo, GeneratorFn, Parameters<T>[0]] => {
        i.key = key;
        return [i, gen, generatorProps]
    }
}