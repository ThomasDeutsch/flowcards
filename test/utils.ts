import { ActionAndReactions, EventRecord, LoggedAction, RequestBid } from "../src/index.ts";
import { FlowGeneratorFunction } from "../src/flow.ts";
import { FlowReaction } from "../src/flow-reaction.ts";
import { ActionReactionGenerator, Scheduler } from "../src/scheduler.ts";
import { deadline } from "https://deno.land/std@0.190.0/async/mod.ts";
import { ActionAndReactionsTest } from "../src/action-reaction-logger.ts";
import { Placed } from "../src/bid.ts";
import { equalPaths } from "../src/utils.ts";
import { ExternalAction, RejectPendingRequestAction, ResolvePendingRequestAction } from "../src/index.ts";


function isSameAction(a?: LoggedAction<any>, b?: LoggedAction<any>): boolean {
    if(a === undefined && b === undefined) return true;
    if(a === undefined || b === undefined) return false;
    const x = a.type === b.type && a.id === b.id && a.bidId === b.bidId && equalPaths(a.flowPath, b.flowPath) && a.id === b.id;
    if(x === false) return false;
    if(a.eventId !== b.eventId) return false;
    if(a.type === 'rejectPendingRequest' || a.type === 'resolvePendingRequest') {
        return a.requestActionId === (b as typeof a).requestActionId; //TODO: better type check
    }
    return true;
}

function isSameReaction(a: FlowReaction, b: FlowReaction): boolean {
    if(a.type !== b.type) return false;
    if(!equalPaths(a.flowPath, b.flowPath)) return false;
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

function getYieldValueFromTests(action: LoggedAction<any> | undefined, useMocks: boolean, remainingTests: ActionAndReactionsTest[], reject: (reason: string) => void, getPendingRequests: () => Placed<RequestBid<any, any>>[]): "mockRequest" | undefined | ExternalAction<any> & {id: number}  | ResolvePendingRequestAction<any> | RejectPendingRequestAction {
    if(action === undefined) return undefined;
    if(action.type === 'external') {
        return action;
    }
    if(!useMocks) return undefined;
    // mock request
    if(action.type === 'requestedAsync') {
        const hasMock = remainingTests.some((test) => {
            const resolveRejectAction = test.action;
            if(resolveRejectAction === undefined) return false;
            if(resolveRejectAction.type !== 'resolvePendingRequest' && resolveRejectAction.type !== 'rejectPendingRequest') return false;
            if(resolveRejectAction.requestActionId === action.id) return true;
            return false;
        });
        if(hasMock) {
            return 'mockRequest';
        }
        return undefined;
    }
    // mock resolve / reject
    if(action.type === 'resolvePendingRequest' || action.type === 'rejectPendingRequest') {
        if(!getPendingRequests().some((bid) => bid.event.id === action.eventId)) {
            reject(`no pending request for event ${action.eventId} found`);
            return;
        }
        return action;
    }
    return undefined;
}

export function* actionReactionTest(useMocks: boolean, recorded: ActionAndReactions[], remainingTests: ActionAndReactionsTest[], resolve: (nr: number) => void, reject: (reason: string) => void, getPendingRequests: () => Placed<RequestBid<any, any>>[]): ActionReactionGenerator {
    const nrTests = remainingTests.length;
    while(true) {
        // get the next logged actions, reactions and tests
        const nextTest = remainingTests[0];
        remainingTests.shift();
        const nextLogged = yield getYieldValueFromTests(nextTest?.action, useMocks, remainingTests, reject, getPendingRequests);
        if(nextLogged === 'runEnd') {
            if(getPendingRequests().length === 0) break; // end the test!
            continue; // skip the tests, because there are no action/reactions to test
        }
        if(nextLogged === undefined && nextTest?.action !== undefined) {
            console.log('no next logged action', nextTest)
            reject(`expected action ${JSON.stringify(nextTest?.action)} but got undefined`);
            return;
        }
        else if(nextLogged === undefined) {
            continue;
        }
        console.log('next logged: ', nextLogged);
        recorded.push(nextLogged);
        if(nextTest !== undefined) {
            if(nextTest.action) {
                if(!isSameAction(nextTest.action, nextLogged?.action)) {
                    reject(`expected action ${JSON.stringify(nextTest.action)} but got ${JSON.stringify(nextLogged?.action)}`);
                    return;
                }
            }
            if(nextTest.reactions) {
                if(!areSameReactions(nextTest.reactions, nextLogged?.reactions)) {
                    reject(`expected reactions ${JSON.stringify(nextTest.reactions)} but got ${JSON.stringify(nextLogged?.reactions)}`);
                    return;
                }
            }
            if(nextTest.test && nextLogged?.action) {
                if(nextLogged.action?.type !== 'rejectPendingRequest' && nextLogged.action?.type !== 'requestedAsync') {
                    nextTest.test(nextLogged.action?.payload);
                } else {
                    nextTest.test(undefined);
                }
            }
        }
    }
    if(nrTests === 0) {
        reject(`no tests specified. ${recorded.length} tests recorded`);
    }
    else if(remainingTests.length > 0) {
        reject(`expected ${remainingTests.length} more actions, but got none`)
    }
    else if(nrTests < recorded.length) {
        reject(`expected ${nrTests} actions, but got ${recorded.length}`)
    }
    resolve(1);
}


export async function runFlowcardsTests(testContext: Deno.TestContext, rootFlow: FlowGeneratorFunction, events: EventRecord, tests?: ActionAndReactionsTest[]): Promise<void> {
    const recorded: ActionAndReactions[] = [];
    const useMocks = tests !== undefined;
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
                actionReactionGenerator: actionReactionTest(useMocks, recorded, remainingTests || [], resolve, reject, getPendingRequests)
            })
        })
        scheduler?.run();
        await deadline(promise, 3000);
        await Deno.writeTextFile(`./${testContext.name}.json`, JSON.stringify(recorded, null, 2));
    }
    catch(e) {

        await Deno.writeTextFile(`./${testContext.name}.json`, JSON.stringify(recorded, null, 2));
        throw e;
    }
}