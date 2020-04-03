/* eslint-disable @typescript-eslint/no-explicit-any */

import { ThreadDictionary } from './bthread';
import { DispatchByWait } from './dispatch-by-wait';


export type OverridesByComponent = Record<string, any[]>;


export function getOverridesByComponentName(orderedThreadIds: string[], dispatchByWait: DispatchByWait, threadDictionary: ThreadDictionary): OverridesByComponent {
    const o: OverridesByComponent = {};
    orderedThreadIds.forEach((id): void => {
        const overrides = threadDictionary[id].overrides;
        overrides.forEach((overrideFn): void => {
            const override = overrideFn(dispatchByWait, threadDictionary[id].pendingEvents);
            Object.keys(override).forEach((componentName): void => {
                if (!o[componentName]) o[componentName] = [];
                o[componentName].push(override[componentName]);
            });
        })
    });
    return o;
}
