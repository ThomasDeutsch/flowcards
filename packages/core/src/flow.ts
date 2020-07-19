import { GeneratorFn, BThreadKey } from './bthread';
import { uuidv4 } from './utils';

export type FlowContext = {
    id: string;
    title?: string;
    description?: string;
    key?: BThreadKey;
    gen: GeneratorFn;
    props: any;
    destroyOnDisable: boolean;
};

interface FlowInfo {
    id?: string;
    title?: string;
    destroyOnDisable?: boolean;
}

export function flow<T extends GeneratorFn>(info: FlowInfo | null, gen: T): (generatorProps?: Parameters<T>[0], flowKey?: BThreadKey) => FlowContext {
    const context: FlowContext = {
        id: info?.id || uuidv4(),
        title: info?.title,
        key: undefined,
        gen: gen,
        props: undefined,
        destroyOnDisable: info?.destroyOnDisable || false
    };
    return (generatorProps?: Parameters<T>[0], key?: BThreadKey): FlowContext => {
        context.props = generatorProps;
        context.key = key;
        return context;
    }
}