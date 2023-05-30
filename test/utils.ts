import { ActionAndReactions, EventRecord } from "../src/index.ts";
import { SelectedAction } from "../src/action.ts";
import { FlowGeneratorFunction } from "../src/flow.ts";
import { FlowReaction } from "../src/flow-reaction.ts";
import { Scheduler } from "../src/scheduler.ts";
import { assertEquals } from "https://deno.land/std@0.189.0/testing/asserts.ts";

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
    // for the flowpath, check if all items are the same string
    if(a.flowPath.length !== b.flowPath.length) return false;
    for(let i = 0; i < a.flowPath.length; i++) {
        if(a.flowPath[i] !== b.flowPath[i]) return false;
    }
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

export function* actionReactionTest(tests: ActionAndReactions[], resolve: (value: ActionAndReactions[]) => void, reject: (s: string) => void): Generator<void, void, ActionAndReactions> {
    const remainingTests = [...tests];
    const recorded: ActionAndReactions[] = [];
    let {action, reactions} = yield;
    while(!(action === undefined && reactions === undefined)) {
        recorded.push({action, reactions});
        const currentTest = remainingTests.shift();
        if(currentTest !== undefined) {
            if(!isSameAction(currentTest.action, action)) {
                reject(`expected action ${JSON.stringify(currentTest.action)} but got ${JSON.stringify(action)}`);
            }
            console.log('check reactions: ', areSameReactions(currentTest.reactions, reactions), currentTest.reactions, reactions)
            if(!areSameReactions(currentTest.reactions, reactions)) {
                reject(`expected reactions ${JSON.stringify(currentTest.reactions)} but got ${JSON.stringify(reactions)}`);
            }
            if(currentTest.action?.type !== 'rejectPendingRequest') {
                currentTest.test?.(currentTest.action?.payload);
            } else {
                currentTest.test?.(undefined);
            }
            if(currentTest.effect !== undefined) {
                queueMicrotask(() => {
                    currentTest.effect?.();
                });
            }
        }
        const next = yield;
        action = next.action;
        reactions = next.reactions;
    }
    if(remainingTests.length > 0) {
        reject(`expected ${remainingTests.length} more actions, but got none`);
        return;
    }
    resolve(recorded);
    return;
}

export async function runFlowcardsTests(testContext: Deno.TestContext, rootFlow: FlowGeneratorFunction, events: EventRecord, testSteps?: ActionAndReactions[]) {
    let actionsReactions: ActionAndReactions[] = [];
    try {
        actionsReactions = await new Promise((resolve, reject) => {
            const testGenerator = actionReactionTest(testSteps || [], resolve, reject);
            new Scheduler({
                id: 'rootFlow',
                events,
                rootFlow,
                actionReactionGenerator: testGenerator
            })
        });

    }
    catch(e) {
        console.log('error', e);
        throw e;
    }
    //return await Deno.writeTextFile(`./${testContext.name}.json`, JSON.stringify(actionsReactions, null, 2));
};