import { Action, ActionAndReactions, AskForBid, EventRecord, ExternalAction, LoggedAction, RequestBid } from "../src/index.ts";
import { FlowGeneratorFunction } from "../src/flow.ts";
import { FlowReaction } from "../src/flow-reaction.ts";
import { Scheduler } from "../src/scheduler.ts";
import { deadline } from "https://deno.land/std@0.190.0/async/mod.ts";
import { ActionAndReactionsTest } from "../src/action-reaction-logger.ts";
import { areEqualPaths } from "../src/utils.ts";
import { Placed } from "../src/bid.ts";


function isSameAction(a?: Omit<LoggedAction<any>, 'payload'>, b?: Omit<LoggedAction<any>, 'payload'>): boolean {
    if(a === undefined && b === undefined) return true;
    if(a === undefined || b === undefined) return false;
    const x = a.type === b.type && a.id === b.id && a.bidId === b.bidId && areEqualPaths(a.flowPath, b.flowPath) && a.id === b.id;
    if(x === false) return false;
    if(a.type === 'rejectPendingRequest' || a.type === 'resolvePendingRequest') {
        return (a as any).requestActionId === (b as any).requestActionId; //TODO: better type check
    }
    return true;
}

function isSameReaction(a: FlowReaction, b: FlowReaction): boolean {
    if(a.type !== b.type) return false;
    if(!areEqualPaths(a.flowPath, b.flowPath)) return false;
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

function getMockedAsyncRequest(action: Action<any>) {
    if(action.type === 'requestedAsync' && action.payload === undefined) {
        action.payload = new Promise(() => null);
    }
}


export function* actionReactionTest(recorded: ActionAndReactions[], remainingTests: ActionAndReactionsTest[], resolve: (nr: number) => void, reject: (reason: string) => void, getPendingRequests: () => Placed<RequestBid<any, any>>[]): Generator<ExternalAction<any> & {id: number} | undefined, void, ActionAndReactions> {
    while(true) {
        let {action, reactions} = yield remainingTests[0]?.action?.type === 'external' ? remainingTests[0]?.action : undefined;
        if(action === undefined && reactions === undefined && getPendingRequests().length === 0) break;
        recorded.push({action, reactions});
        const currentTest = remainingTests.shift();
        if(currentTest !== undefined) {
            if(!isSameAction(currentTest.action, action)) {
                reject(`expected action ${JSON.stringify(currentTest.action)} but got ${JSON.stringify(action)}`);
                return;
            }
            if(!areSameReactions(currentTest.reactions, reactions)) {
                reject(`expected reactions ${JSON.stringify(currentTest.reactions)} but got ${JSON.stringify(reactions)}`);
                return;
            }
            if(currentTest.action?.type !== 'rejectPendingRequest') {
                currentTest.test?.(currentTest.action?.payload);
            } else {
                currentTest.test?.(undefined);
            }
        }
    }
    resolve(1);
    return;
}


export async function runFlowcardsTests(testContext: Deno.TestContext, rootFlow: FlowGeneratorFunction, events: EventRecord, tests?: ActionAndReactionsTest[]): Promise<void> {
    const recorded: ActionAndReactions[] = [];
    const remainingTests = [...tests || []];
    let scheduler: Scheduler | undefined;
    const getPendingRequests = ()  => {
        return scheduler!.getPendingRequests();
    }
    try {
        const promise = new Promise<number>((resolve, reject) => {
            scheduler = new Scheduler({
                id: 'rootFlow',
                events,
                rootFlow,
                actionReactionGenerator: actionReactionTest(recorded, remainingTests || [], resolve, reject, getPendingRequests)
            })
        })
        scheduler?.run();
        await deadline(promise, 3000);
        await Deno.writeTextFile(`./${testContext.name}.json`, JSON.stringify(recorded, null, 2));
    }
    catch(e) {
        if(tests === undefined || tests.length === 0) {
            console.error(`no tests specified. ${recorded.length} tests recorded`);
        }
        else if(remainingTests.length > 0) {
            console.error(`expected ${remainingTests.length} more actions, but got none`);
        }
        else if(tests.length < recorded.length) {
            console.error(`expected ${tests.length} actions, but got ${recorded.length}`);
        }
        await Deno.writeTextFile(`./${testContext.name}.json`, JSON.stringify(recorded, null, 2));
        throw e;
    }
}