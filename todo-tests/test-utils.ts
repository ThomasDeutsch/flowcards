import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RuleGeneratorFunction, Rule } from "../core/rule.ts";
import type { TestGenerator } from "../core/engine.ts";
import type { InputAction } from "../core/action.ts";
import type { ActionAndReactions } from "../core/action-reaction-logger.ts";
import { Engine } from "../core/engine.ts";
import { Event } from "../core/event.ts";

// Interface for defining a step in a test scenario
export interface TestStep {
    actionInput?: InputAction<any>;
    effect?: (ref: { actionInput?: InputAction<any> }, prevResult?: ActionAndReactions) => void;
    reactions: any[]; // Use a more specific type if possible, matching reaction structure
    expectRejection?: boolean; // Added flag to indicate expected action rejection
}

// Factory function to create and run a test engine instance
export function testSchedulerFactory(
    rootFlowGenerator: RuleGeneratorFunction,
    initialEvents: Record<string, Event<any>>,
    replaySteps: TestStep[],
    testId: string = "test"
) {
    let currentStep = 0;

    // The generator function passed to the Engine to drive the test
    const testGenerator = function*(this: Rule): TestGenerator {
        let prevResult: ActionAndReactions | undefined = undefined;
        while (true) {
            const step = replaySteps[currentStep];
            if (!step) {
                console.error(`[Tester ${testId}] Error: Reached end of test generator but replaySteps[${currentStep}] is undefined.`);
                throw new Error(`Test setup error: Missing step definition for step ${currentStep}`);
            }
            // console.log(`[Tester ${testId}] Entering Step ${currentStep}`);

            // Prepare actionInput for this step, potentially running an effect first
            let actionInputForStep: InputAction<any> | undefined = step.actionInput;
            if (step.effect) {
                const ref: { actionInput?: InputAction<any> } = {};
                try {
                    step.effect(ref, prevResult);
                    if (ref.actionInput) {
                        actionInputForStep = ref.actionInput;
                    }
                } catch (e) {
                    console.error(`[Tester ${testId}] Error in effect for step ${currentStep}:`, e);
                    throw e; // Re-throw effect errors
                }
            }

            // console.log(`[Tester ${testId}] Yielding actionInput:`, actionInputForStep ? JSON.stringify(actionInputForStep) : 'undefined');

            // Yield action to the engine and get the result
            let resultFromEngine: ActionAndReactions & { hasFinished?: boolean };
            try {
                 resultFromEngine = (yield actionInputForStep as any) as ActionAndReactions & { hasFinished?: boolean };
            } catch (e) {
                 console.error(`[Tester ${testId}] Error receiving result from engine for step ${currentStep}:`, e);
                 throw e; // Re-throw engine errors
            }
            // console.log(`[Tester ${testId}] Received result from engine:`, JSON.stringify(resultFromEngine, null, 2));
            prevResult = resultFromEngine; // Store for the next step's effect

            // ---> Handle Action Rejection <--- 
            if (resultFromEngine?.actionRejected) {
                if (!step.expectRejection) {
                    // If rejection wasn't expected, fail the test
                    throw new Error(`[Step ${currentStep}] Action was unexpectedly rejected. Invalid Info: ${JSON.stringify(resultFromEngine.invalidActionInfo)}`);
                }
                 // If rejection was expected, proceed to check reactions
                 console.log(`[Tester ${testId}] Action correctly rejected in Step ${currentStep}`);
            } else {
                 if (step.expectRejection) {
                     // If rejection was expected but didn't happen, fail the test
                     throw new Error(`[Step ${currentStep}] Action was expected to be rejected but was processed.`);
                 }
                 // If rejection wasn't expected and didn't happen, proceed normally
            }

            // Assert reactions match the expected ones for this step
            assertReactionsMatch(resultFromEngine?.reactions, step.reactions, `Step ${currentStep}`);

            // Check if the engine signaled completion
            if (resultFromEngine?.hasFinished) {
                // console.log(`[Tester ${testId}] Engine finished.`);
                break;
            }

            currentStep++;
            // Check if we've run out of defined steps but the engine hasn't finished
            if (currentStep >= replaySteps.length) {
                // console.warn(`[Tester ${testId}] Replay steps finished, but engine has not. Waiting for engine finish.`);
                try {
                    const finalResult = (yield undefined) as ActionAndReactions & { hasFinished?: boolean };
                    // console.log(`[Tester ${testId}] Engine finished after replay steps ended.`, JSON.stringify(finalResult, null, 2));
                    if (finalResult?.reactions && finalResult.reactions.length > 0) {
                        // console.warn("Engine produced reactions after replay steps ended:", finalResult.reactions);
                    }
                } catch (e) {
                     console.error(`[Tester ${testId}] Error receiving final result from engine after steps ended:`, e);
                     throw e;
                }
                break;
            }
        }
    }

    // Create the engine instance
    const engine = new Engine({
        id: testId,
        rootRule: rootFlowGenerator,
        createTester: testGenerator
    });

    // Connect initial events to the engine
    if (initialEvents) {
        Object.values(initialEvents).forEach(event => {
            engine.__connectEventToEngine(event);
        });
    }

    // Perform the initial engine run to start the process
    // console.log(`[Scheduler ${testId}] Initial engine run.`);
    try {
        engine.run();
    } catch (e) {
        console.error(`[Scheduler ${testId}] Error during initial engine run:`, e);
        throw e; // Re-throw initial run errors
    }
}

// Utility function to assert that actual reactions match expected reactions
export function assertReactionsMatch(actual: any[] | undefined, expected: any[], stepLabel: string) {
    // If expecting no reactions, allow actual to be undefined or empty
    if (expected.length === 0) {
        if (actual === undefined || actual.length === 0) {
            return; // Pass: No reactions expected, none (or empty array) received.
        }
        // Fall through to fail if actual has reactions when none were expected
    }
    
    // Original check: if expected is not empty, actual must exist.
    assertExists(actual, `[${stepLabel}] Reactions missing (expected ${expected.length})`);

    // Determine engine ID from the first actual reaction to adjust expected paths
    const actualEngineId = actual[0]?.rulePath?.[0];
    if (!actualEngineId) {
        if(expected.length > 0) {
             // console.warn(`[${stepLabel}] Could not determine actual engine ID from first reaction:`, actual[0]);
        }
    }
    const expectedWithEngineId = expected.map(r => ({
        ...r,
        // Prepend the actual engine ID to the expected flowPath if available
        flowPath: actualEngineId ? [actualEngineId, ...(r.flowPath || [])] : r.flowPath
    }));

    // Assert that the number of reactions matches
    assertEquals(actual.length, expectedWithEngineId.length, `[${stepLabel}] Number of reactions mismatch. Expected(${expectedWithEngineId.length}): ${JSON.stringify(expectedWithEngineId)}, Actual(${actual.length}): ${JSON.stringify(actual)}`);

    // Assert details for each reaction
    for (let i = 0; i < expectedWithEngineId.length; i++) {
        const exp = expectedWithEngineId[i];
        const act: any = actual[i]; // Using any here for simplicity, consider a Reaction type
        
        // Compare reaction type
        assertEquals(act.type, exp.type, `[${stepLabel}] Reaction ${i} type mismatch`);
        
        // Compare rule path (allowing actual path to be longer, checking prefix)
        if (exp.flowPath) { 
            assertExists(act.rulePath, `[${stepLabel}] Reaction ${i} actual rulePath missing`);
            const expectedPathStr = exp.flowPath.join('/');
            const actualPathStr = act.rulePath.join('/');
             assert(actualPathStr.startsWith(expectedPathStr), 
                    `[${stepLabel}] Reaction ${i} rulePath mismatch. Expected prefix: ${expectedPathStr}, Actual: ${actualPathStr}`);
        }
        
        // Compare details object (checking expected keys exist and match)
        if (exp.details) {
            assertExists(act.details, `[${stepLabel}] Reaction ${i} details missing`);
            for (const key in exp.details) {
                assertEquals(act.details[key], exp.details[key], `[${stepLabel}] Reaction ${i} details.${key} mismatch`);
            }
        }
    }
} 