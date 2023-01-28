import { FlowGeneratorFunction } from "../src/flow";
import { SchedulerCompletedCallback, Scheduler } from "../src/scheduler";

export function testSchedulerFactory(rootFlow: FlowGeneratorFunction, completedCB?: SchedulerCompletedCallback) {
    return new Scheduler({
        rootFlow,
        completedCB
    })
};