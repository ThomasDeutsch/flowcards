import { ActionAndReactions, AskForBid, EventRecord, ExternalAction, LoggedAction } from "../src/index.ts";
import { FlowGeneratorFunction } from "../src/flow.ts";
import { FlowReaction } from "../src/flow-reaction.ts";
import { Scheduler } from "../src/scheduler.ts";
import { deadline } from "https://deno.land/std@0.190.0/async/mod.ts";
import { ActionAndReactionsTest } from "../src/action-reaction-logger.ts";


function isSameAction(a?: Omit<LoggedAction<any>, 'payload'>, b?: Omit<LoggedAction<any>, 'payload'>): boolean {
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

export function* actionReactionTest(recorded: ActionAndReactions[], tests: ActionAndReactionsTest[], resolve: (nr: number) => void, reject: (reason: string) => void, scheduler: Scheduler): Generator<ExternalAction<any> & {id: number} | undefined, void, ActionAndReactions> {
    const remainingTests = [...tests];
    let {action, reactions} = yield remainingTests[0]?.action?.type === 'external' ? remainingTests[0]?.action : undefined;
    while(!(action === undefined && reactions === undefined) || scheduler.getPendingRequests().length > 0) {
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
        }
        if(remainingTests.length === 0) {
            break;
        }
        const next = yield remainingTests[0]?.action?.type === 'external' ? remainingTests[0]?.action : undefined;
        action = next.action;
        reactions = next.reactions;
    }
    console.log('recorded: ', recorded, tests.length, recorded.length);

    console.log('remaining tests: ', remainingTests)
    if(remainingTests.length > 0) {
        reject(`expected ${remainingTests.length} more actions, but got none`);
    }
    else if(tests.length < recorded.length) {
        reject(`expected ${tests.length} actions, but got ${recorded.length}`);
    }
    resolve(1);
    return;
}

export async function runFlowcardsTests(testContext: Deno.TestContext, rootFlow: FlowGeneratorFunction, events: EventRecord, testSteps?: ActionAndReactions[]): Promise<void> {
    const recorded: ActionAndReactions[] = [];
    let scheduler: Scheduler | undefined;
    try {
        const promise = new Promise<number>((resolve, reject) => {
            scheduler = new Scheduler({
                id: 'rootFlow',
                events,
                rootFlow,
                actionReactionGenerator: actionReactionTest(recorded, testSteps || [], resolve, reject, scheduler!)
            })
        })
        scheduler?.run();
        await deadline(promise, 3000);
        await Deno.writeTextFile(`./${testContext.name}.json`, JSON.stringify(recorded, null, 2));
    }
    catch(e) {
        //const askedForActions = scheduler?.getAskForBids().map(b => ({eventId: b.event.id, type: 'external', id: (recorded[recorded.length-1].action?.id || -1) + 1, bidId: b.id, flowId: b.flow.id, payload: 'TBD' }) satisfies Action<any>);
        await Deno.writeTextFile(`./${testContext.name}.json`, JSON.stringify(recorded, null, 2));
        throw e;
    }
}