import { AnyAction } from 'action';
import { FlowCards, NestedEventObject, UpdateCB } from 'index';
import { Replay } from 'replay';
import { StagingCB } from '../src/staging';

export function testScenarios(stagingCB: StagingCB, events: NestedEventObject, updateCB?: UpdateCB, initialActionsOrReplay?: Replay | AnyAction[]): FlowCards {
    if(updateCB === undefined) updateCB = ()=>{const x = 1;}
    return new FlowCards({
        stagingCB,
        updateCB,
        doInitialUpdate: true,
        initialActionsOrReplay,
        events
    });
}

export function delay<T>(ms: number, value: T): Promise<T> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

export function failedDelay<T>(ms: number, value: T): Promise<T> {
    return new Promise((resolve, reject) => setTimeout(() => reject(value), ms));
}
