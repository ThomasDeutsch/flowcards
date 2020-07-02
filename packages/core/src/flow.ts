import { GeneratorFn, BThreadKey } from './bthread';
import { uuidv4 } from './utils';

export type FlowContext = {
    id: string;
    title?: string;
    description?: string;
    key?: BThreadKey;
    gen: GeneratorFn;
    args: any;
};

interface FlowInfo {
    id?: string;
    title?: string;
}

export function flow<T extends GeneratorFn>(info: FlowInfo | null, gen: T): (generatorArguments: Parameters<T>, flowKey?: BThreadKey) => FlowContext {
    const context: FlowContext = {
        id: info?.id || uuidv4(),
        title: info?.title,
        key: undefined,
        gen: gen,
        args: undefined
    };
    return (args: Parameters<T>, key?: BThreadKey): FlowContext => {
        context.args = args;
        context.key = key;
        return context;
    }
}