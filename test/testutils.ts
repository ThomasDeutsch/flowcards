import { AnyAction } from '../src/action';
import { FlowCards, UpdateCB } from '../src/index';
import { Replay } from '../src/replay';
import { StagingCB } from '../src/staging';

export function testScenarios(stagingCB: StagingCB, updateCB?: UpdateCB, initialActionsOrReplay?: Replay | AnyAction[]): FlowCards {
    if(updateCB === undefined) updateCB = ()=>{const x = 1;}
    return new FlowCards({
        stagingCB,
        updateCB,
        doInitialUpdate: true,
        initialActionsOrReplay
    });
}

export function delay<T>(ms: number, value: T): Promise<T> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

export function failedDelay<T>(ms: number, value: T): Promise<T> {
    return new Promise((resolve, reject) => setTimeout(() => reject(value), ms));
}
