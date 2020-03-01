import { UpdateInfo } from "./updateloop";

type ComponentOverrideInfo = {
    id: string;
    overrides: any[];
}

interface Dictionary<T> {
    [Key: string]: T;
}

export function getOverrides({
    orderedThreadIds,
    dispatchByWait,
    threadDictionary
}: UpdateInfo): Dictionary<ComponentOverrideInfo> {
    let obcn: Dictionary<ComponentOverrideInfo> = {};
    orderedThreadIds.forEach(id => {
        const overrideFn = threadDictionary[id].override;
        if (overrideFn) {
            const override = overrideFn(dispatchByWait, new Set(threadDictionary[id].pendingEventNames));
            Object.keys(override).forEach(componentName => {
                if (!obcn[componentName]) obcn[componentName] = { id: "", overrides: [] } as ComponentOverrideInfo;
                obcn[componentName].id = `${obcn[componentName].id}${id}${threadDictionary[id].state.nrProgressions}`;
                obcn[componentName].overrides.push(override[componentName]);
            });
        }
    });
    return obcn;
}