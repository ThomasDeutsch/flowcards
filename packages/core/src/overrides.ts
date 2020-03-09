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
        const overrideFn = threadDictionary[id].override;
        if (overrideFn) {
            const override = overrideFn(dispatchByWait, threadDictionary[id].pendingEvents);
            Object.keys(override).forEach((componentName): void => {
                if (!o[componentName]) o[componentName] = { id: "", overrides: [] };
                o[componentName].id = `${o[componentName].id}${id}${threadDictionary[id].state.nrProgressions}`;
                o[componentName].overrides.push(override[componentName]);
            });
        }
    });
    return o;
}