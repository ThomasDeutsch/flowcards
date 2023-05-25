import { ActionAndReactions, EventRecord } from "../src";
import { SelectedAction } from "../src/action";
import { FlowGeneratorFunction } from "../src/flow";
import { FlowReaction } from "../src/flow-reaction";
import { Scheduler } from "../src/scheduler";

function isSameAction(a?: Omit<SelectedAction<any>, 'payload'>, b?: Omit<SelectedAction<any>, 'payload'>): boolean {
    if(a === undefined && b === undefined) return true;
    if(a === undefined || b === undefined) return false;
    const x = a.type === b.type && a.id === b.id && a.bidId === b.bidId && a.flowId === b.flowId && a.id === b.id;
    if(x === false) return false;
    if(a.type === 'rejectPendingRequest' || a.type === 'resolvePendingRequest') {
        return (a as any).requestActionId === (b as any).requestActionId; //TODO: better type check
    }
    return true;
}

function isSameReaction(a: FlowReaction, b: FlowReaction): boolean {
    if(a.type !== b.type) return false;
    const aDetails = a.details;
    const bDetails = b.details;
    if(aDetails.actionId !== bDetails.actionId) return false;
    if(aDetails.bidId !== bDetails.bidId) return false;
    if(aDetails.bidType !== bDetails.bidType) return false;
    if(aDetails.childFlowId !== bDetails.childFlowId) return false;
    if(aDetails.eventId !== bDetails.eventId) return false;
    return true;
}

function areSameReactions(expected?: FlowReaction[], actual?: FlowReaction[]): boolean {
    if(expected === undefined && actual === undefined) return true;
    if(expected === undefined || actual === undefined) return false;
    if(expected.length !== actual.length) return false;
    for(let i = 0; i < expected.length; i++) {
        if(!isSameReaction(expected[i], actual[i])) return false;
    }
    return true;
}

export function* actionReactionTest(tests: ActionAndReactions[]): Generator<void, void, ActionAndReactions> {
    for(const {action, reactions, effect, test} of tests) {
        const actionAndReactions = yield;
        console.log('action: ',  actionAndReactions.action);
        actionAndReactions.reactions?.forEach((v, k) => console.log(k, v));

        if(!isSameAction(actionAndReactions.action, action)) {
            throw new Error(`expected action ${JSON.stringify(action)} but got ${JSON.stringify(actionAndReactions.action)}`);
        }
        if(reactions !== undefined) {
            if(!areSameReactions(reactions, actionAndReactions.reactions)) {
                throw new Error(`expected reactions ${JSON.stringify(reactions)} but got ${JSON.stringify(actionAndReactions.reactions)}`);
            }
        }
        if(actionAndReactions.action?.type !== 'rejectPendingRequest') {
            test?.(actionAndReactions.action?.payload);
        }
        console.log('effect');
        queueMicrotask(() => {
            effect?.();
        });
    }
}

export function testSchedulerFactory(rootFlow: FlowGeneratorFunction, events: EventRecord, testSteps?: ActionAndReactions[]) {
    return new Scheduler({
        id: 'test',
        events,
        rootFlow,
        actionReactionGenerator: actionReactionTest(testSteps || [])
    })
};