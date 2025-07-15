import { assertEquals, assertExists } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { Flow } from "../src/flow.ts";
import { Event } from "../src/event.ts";
import { request, waitFor } from "../src/bid.ts";
import { Engine, RuleGeneratorFunction } from "../src/index.ts";
import { ActionAndReactions } from "../src/action-reaction-logger.ts";
import { TestGenerator } from "../src/engine.ts";
import { Placed, SetBid } from "../src/bid.ts";

// Mock testSchedulerFactory based on observed usage
// THIS IS A SIMPLIFIED MOCK FOR DEMONSTRATION - Actual implementation might be more complex
let testIdCounter = 0;
function testSchedulerFactory(
    rootFlowGenerator: RuleGeneratorFunction,
    initialEvents?: Record<string, Event<any, any>>,
    replaySteps?: Array<{
        action?: any; // Simplified action type
        reactions?: any[]; // Simplified reaction type
        effect?: () => void;
    }>
) {
    const testId = `test-${testIdCounter++}`;
    let currentStep = 0;

    function* testGenerator(engine: Engine): TestGenerator {
        while (true) {
            const currentReplayStep = replaySteps?.[currentStep];
            console.log(`[Tester ${testId}] Step ${currentStep}`);

            // --- Effect before action processing ---
            if (currentReplayStep?.effect && currentStep > 0) { // Avoid effect on initial start
                 try {
                    console.log(`[Tester ${testId}] Running pre-effect for step ${currentStep}`);
                    currentReplayStep.effect();
                } catch (e) {
                    console.error(`[Tester ${testId}] Error in pre-effect step ${currentStep}:`, e);
                    throw e; // Rethrow to fail the test
                }
            }

            // --- Yield action to engine / or mock request ---
            let actionToProcess: any = undefined;
            if (currentReplayStep?.action) {
                actionToProcess = { ...currentReplayStep.action, id: engine.currentActionId + 1 }; // Inject expected action ID
                console.log(`[Tester ${testId}] Yielding action for step ${currentStep}:`, actionToProcess);
            } else {
                 // If no specific action defined, maybe default to processing a request?
                 // Or yield undefined to let engine run naturally?
                 // For this mock, let's yield undefined to let engine process requests
                 console.log(`[Tester ${testId}] Yielding undefined (let engine process requests) for step ${currentStep}`);
                 actionToProcess = undefined; // Let engine run its course or yield 'mockRequest'
            }

            // --- Receive results from engine ---
            const resultFromEngine: ActionAndReactions & { hasFinished?: boolean } = yield actionToProcess;
            console.log(`[Tester ${testId}] Received result from engine for step ${currentStep}:`, resultFromEngine);

            if (resultFromEngine.hasFinished) {
                console.log(`[Tester ${testId}] Engine finished.`);
                // Final checks if needed
                 if (currentReplayStep?.reactions) {
                     assertReactionsMatch(resultFromEngine.reactions, currentReplayStep.reactions, `Step ${currentStep} (Final)`);
                 }
                 if (currentReplayStep?.effect) { // Allow final effect
                    console.log(`[Tester ${testId}] Running final post-effect.`);
                    currentReplayStep.effect();
                 }
                break; // Exit tester loop
            }

            // --- Assertions ---
            if (currentReplayStep?.reactions) {
                assertReactionsMatch(resultFromEngine.reactions, currentReplayStep.reactions, `Step ${currentStep}`);
            }
             // --- Effect after action processing & validation ---
            // Note: Original example had effect potentially before OR after reactions.
            // Placing it here seems more logical for post-action effects.
            // if (currentReplayStep?.effect) {
            //     console.log(`[Tester ${testId}] Running post-effect for step ${currentStep}`);
            //     currentReplayStep.effect();
            // }

            currentStep++;
            if (replaySteps && currentStep >= replaySteps.length) {
                console.warn(`[Tester ${testId}] Replay steps finished, but engine has not. Waiting for engine finish.`);
                // Keep yielding undefined until engine finishes
                 const finalResult = yield undefined;
                 console.log(`[Tester ${testId}] Engine finished after replay steps ended.`, finalResult);
                 break;
            }
        }
    }

    const engine = new Engine({
        id: testId,
        rootRule: rootFlowGenerator,
        createTester: testGenerator
    });

     if (initialEvents) {
        Object.values(initialEvents).forEach(event => engine.__connectEventToEngine(event));
    }

    // Initial run if no replay steps start with an effect/action
    if (!replaySteps || replaySteps.length === 0 || (!replaySteps[0].action && !replaySteps[0].effect)) {
         console.log(`[Scheduler ${testId}] Initial engine run.`);
        engine.run();
    }
     // The testGenerator loop handles subsequent engine.run() implicitly via yield
}

// Simplified reaction matcher
function assertReactionsMatch(actual: any[] | undefined, expected: any[], stepLabel: string) {
    assertExists(actual, `[${stepLabel}] Reactions missing`);
    assertEquals(actual.length, expected.length, `[${stepLabel}] Number of reactions mismatch`);
    for(let i = 0; i < expected.length; i++) {
        // Basic type check - real implementation would need deep comparison
        assertEquals(actual[i].type, expected[i].type, `[${stepLabel}] Reaction ${i} type mismatch`);
        // Check flowPath if present
        if(expected[i].flowPath) {
             assertEquals(actual[i].flowPath, expected[i].flowPath, `[${stepLabel}] Reaction ${i} flowPath mismatch`);
        }
        // TODO: Add checks for details - requires deeper comparison logic
    }
}

// --- Actual Test --- 
Deno.test("Rule: Unhandled error restarts the rule", () => {
    const eventA = new Event<number>('eventA');
    const eventB = new Event<number>('eventB');
    let startCount = 0;

    const rootFlow = function*(this: Flow) {
        startCount++;
        console.log(`[Flow] Starting run ${startCount}`);
        yield waitFor(eventA);
        console.log(`[Flow] Got eventA (${eventA.value}), yielding request(eventB)`);
        yield request(eventB, 1);
        console.log("[Flow] Got eventB, now throwing error");
        if (startCount === 1) { // Throw only on the first run
             throw new Error("Unhandled error!");
        }
        console.log("[Flow] Error was handled or not thrown, yielding undefined");
        yield undefined; // Keep flow alive second time
    };

    testSchedulerFactory(rootFlow, { eventA, eventB }, [
        {
            // Step 0: Initial state (Rule waits for eventA)
            reactions: [
                { flowPath: ['test-0'], type: 'rule enabled' }, // test-0 is mock engine ID
                // Maybe bid placed reactions? Depends on logger verbosity
            ]
        },
        {
            // Step 1: Trigger eventA, flow progresses to request(eventB)
            effect: () => eventA.dispatch(1), // Use dispatch which validates and runs engine
            action: { type: 'input', eventId: 'eventA', payload: 1 }, // Engine processes the input action
            reactions: [
                { flowPath: ['test-0'], type: 'rule progressed on a bid', details: { bidType: 'when' } },
                // Reaction for placing request(eventB) bid
            ]
        },
        {
             // Step 2: Engine processes request(eventB), flow progresses and throws error
             // Tester yields undefined, engine runs request(eventB)
             reactions: [
                 { flowPath: ['test-0'], type: 'rule progressed on a bid', details: { bidType: 'set' } },
                 { flowPath: ['test-0'], type: 'rule restarted because an error was not handled' }
                 // Might also see 'pending request cancelled' if error happens before async completes
                 // Might see 'rule ended' first then 'rule enabled' if restart implies end+start
                 // --> Need to refine expected reactions based on actual logger output
             ]
        },
        {
             // Step 3: Rule has restarted, waiting for eventA again
             // (No action needed, just check state/reactions from previous step's restart)
             reactions: [
                 { flowPath: ['test-0'], type: 'rule enabled' } // Or whatever restart logs
             ]
        },
        {
            // Step 4: Trigger eventA again
            effect: () => eventA.dispatch(2),
            action: { type: 'input', eventId: 'eventA', payload: 2 },
            reactions: [
                 { flowPath: ['test-0'], type: 'rule progressed on a bid', details: { bidType: 'when' } },
                 // Reaction for placing request(eventB) bid again
             ]
        },
        {
            // Step 5: Engine processes request(eventB), flow progresses (no error this time)
            reactions: [
                { flowPath: ['test-0'], type: 'rule progressed on a bid', details: { bidType: 'set' } },
                 // Reaction for placing undefined bid
            ]
             // effect: () => { assertEquals(startCount, 2, "Rule should have started twice"); done(); } // Add final assertion if async test
        }
    ]);
    // Final assertion outside replay for synchronous tests
    assertEquals(startCount, 2, "Rule should have started twice");
}); 