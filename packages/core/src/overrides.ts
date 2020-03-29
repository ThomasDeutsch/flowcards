/* eslint-disable @typescript-eslint/no-explicit-any */

import { ThreadDictionary } from './bthread';

interface ComponentOverrideInfo {
    id: string;
    overrides: any[];
}

export type OverridesByComponent = Record<string, ComponentOverrideInfo>;


export function getOverridesByComponentName(orderedThreadIds: string[], dispatchByWait: Record<string, Function>, threadDictionary: ThreadDictionary): OverridesByComponent {
    const o: OverridesByComponent = {};
    orderedThreadIds.forEach((id): void => {
        const overrideFnByComponentName = threadDictionary[id].overrideByComponentName;
        const componentNames = Object.keys(overrideFnByComponentName);
        if (componentNames.length > 0) {
            componentNames.forEach((name): void => {
                const override = overrideFnByComponentName[name](dispatchByWait, threadDictionary[id].pendingEvents);
                if (!o[name]) o[name] = { id: "", overrides: [] };
                o[name].id = `${o[name].id}${id}${threadDictionary[id].state.nrProgressions}`;
                o[name].overrides.push(override[name]);
            });
        }
    });
    return o;
}
