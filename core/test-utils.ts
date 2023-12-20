import { ActionAndReactions, LoggedAction } from "./index.ts";
import { FlowReaction } from "./flow-reaction.ts";
import { ActionReactionGenerator, Engine } from "./engine.ts";
import { equalPaths } from "./utils.ts";
import { ExternalAction, RejectPendingRequestAction, ResolvePendingRequestAction } from "./index.ts";


export type TestResult = 'invalid action' | 'invalid reactions' | 'completed' | 'failed test';

function isSameAction(a?: LoggedAction<any>, b?: LoggedAction<any>): boolean {
    if(a === undefined && b === undefined) return true;
    if(a === undefined || b === undefined) return false;
    const x = a.type === b.type && a.id === b.id && a.bidId === b.bidId && equalPaths(a.flowPath, b.flowPath) && a.id === b.id;
    if(x === false) return false;
    if(a.eventId !== b.eventId) return false;
    if(a.type === 'rejectPendingRequest' || a.type === 'resolvePendingRequest') {
        return a.requestActionId === (b as typeof a).requestActionId;
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

/**
 * a function that returns the invalid reactions when comparing the expected reactions with the actual reactions
 * @param expected the expected flow reactions
 * @param actual the actual flow reactions
 */
export function getInvalidReactions(expected?: FlowReaction[], actual?: FlowReaction[]): FlowReaction[] {
    if(expected === undefined || actual === undefined) return actual ?? [];
    return actual.filter((a) => !expected.some((e) => isSameReaction(e, a)));
}

/**
 * get the next action that should be used for testing
 */
function getRecordedTestAction(remainingTests: ActionAndReactions[], nextTest?: ActionAndReactions): "mockRequest" | undefined | ExternalAction<any> & {id: number}  | ResolvePendingRequestAction<any> | RejectPendingRequestAction {
    const action = nextTest?.action;
    if(action === undefined) return undefined;
    // replay external (dispatched) action
    if(action.type === 'requestedAsync') {
        const resolveOrRejectActionWasRecorded = remainingTests.some((test) => {
            if(test.action?.type !== 'resolvePendingRequest' && test.action?.type !== 'rejectPendingRequest') return false;
            if(test.action.requestActionId !== action.id) return false;
            return true;
        });
        if(resolveOrRejectActionWasRecorded) {
            return 'mockRequest';
        }
        return undefined;
    }
    if(action.type === 'resolvePendingRequest' || action.type === 'rejectPendingRequest' || action.type === 'external') {
        return action;
    }
    return undefined;
}


export function* actionReactionTester(engine: Engine, useMocks: boolean, recoredActionsAndReactions: ActionAndReactions[], finishCallback: (result: TestResult, recorded: ActionAndReactions[], engine: Engine) => void): ActionReactionGenerator {
    const remainingTests = [...recoredActionsAndReactions];
    const recorded: ActionAndReactions[] = [];
    while(true) {
        const nextTest = remainingTests.shift();
        const engineRunResult = yield getRecordedTestAction(useMocks ? remainingTests : [], nextTest);
        if(engineRunResult === 'noActionReactionsRecorded') {
            // at this point (initial run), no action & reactions recorded, only the next test-action was transferred to the engine.
            continue;
        }
        if(engineRunResult === 'runEnd') {
            if(engine.pendingRequests.length === 0) break; // end the test
            continue; // wait for the pending requests to be resolved
        }
        // record the current action & reactions from the last engine run
        recorded.push(engineRunResult);
        // if there are tests, check them.
        if(nextTest !== undefined) {
            // 1. check action
            if(!isSameAction(nextTest.action, engineRunResult.action)) {
                finishCallback('invalid action', recorded, engine);
                return;
            }
            // 2. check reactions
            const invalidReactions = getInvalidReactions(nextTest.reactions, engineRunResult.reactions);
            if(invalidReactions.length > 0) {
                finishCallback('invalid reactions', recorded, engine);
                return;
            }
            // 3. check tests
            if(nextTest.tests) {
                // tests will throw an error if they fail
                try {
                    Object.entries(nextTest.tests).forEach(([testId, test]) => {
                        test(engine);
                    });
                }
                catch(error) {
                    finishCallback('failed test', recorded, engine); //TODO: include the name of the failed test!
                    return;
                }
            }
        }
    }
    finishCallback('completed', recorded, engine);
}