import { Event, Rule, RuleGenerator, RuleGeneratorFunction, set, trigger, when } from "../core/index.ts";
import { TestStep, testSchedulerFactory } from "./test-utils.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ResolvePendingRequestAction, RejectPendingRequestAction, InputAction } from "../core/action.ts";
import { RuleReactionType } from "../core/rule-reactions.ts";
import { InvalidBidReason } from "../core/bid-invalid-reasons.ts";
import type { Engine } from "../core/engine.ts";
import type { ActionAndReactions } from "../core/engine-result.ts";

// --- Events ---
const eventA = new Event<number>('eventA');
eventA.setDescription("Event used for pending tests");

const eventB = new Event<string>('eventB'); // Controls rule execution
eventB.setDescription("Control event");

const stateEvent = new Event<string>('stateEvent');
stateEvent.setDescription("Records final state");

// --- Rules ---

// Rule that initiates an async set on eventA
const asyncSetterRule: RuleGeneratorFunction = function*(this: Rule): RuleGenerator {
    yield set(eventA, async () => {
        await new Promise(r => setTimeout(r, 1)); // Simulate async work
        return 100; // Resolved value
    });
    // Rule stays pending here until resolved/rejected
};

// Rule that tries to set eventA synchronously
const syncSetterRule: RuleGeneratorFunction = function*(this: Rule): RuleGenerator {
    yield when(eventB, val => val === 'trySet'); // Wait for signal
    yield set(eventA, 200); // Attempt sync set
    yield set(stateEvent, "Sync set attempted");
};

// Rule that tries to trigger eventA synchronously
const syncTriggerRule: RuleGeneratorFunction = function*(this: Rule): RuleGenerator {
    yield when(eventB, val => val === 'tryTrigger'); // Wait for signal
    yield trigger(eventA, 300); // Attempt sync trigger
    yield set(stateEvent, "Sync trigger attempted");
};

// Rule that waits for eventA (needed for trigger validation)
const waiterRule: RuleGeneratorFunction = function*(this: Rule): RuleGenerator {
     while(true) {
        const [ev] = yield when(eventA);
        yield set(stateEvent, `Waiter got: ${ev.value}`);
     }
};


// --- Test Suite ---

Deno.test("Pending Event: Subsequent 'set' is blocked", async () => {
    eventA.reset();
    eventB.reset();
    stateEvent.reset();

    const rootRule: RuleGeneratorFunction = function*(this: Rule): RuleGenerator {
        this.rule("asyncSetter", asyncSetterRule);
        this.rule("syncSetter", syncSetterRule);
        // Keep root alive
        yield when(new Event<void>('never'));
    };

    const initialEvents = { eventA, eventB, stateEvent };
    let requestActionId = 0; // Default assumption

    const steps: TestStep[] = [
        { // Step 0: Initial setup - asyncSet places bid, syncSet waits
            reactions: [
                { type: RuleReactionType.RULE_ENABLED, rulePath: [] },
                { type: RuleReactionType.RULE_ENABLED, rulePath: ['asyncSetter'] },
                { type: RuleReactionType.BID_PLACED, rulePath: ['asyncSetter'], details: { eventId: 'eventA', bidType: 'set', bidId: 0 } },
                { type: RuleReactionType.RULE_ENABLED, rulePath: ['syncSetter'] },
                { type: RuleReactionType.BID_PLACED, rulePath: ['syncSetter'], details: { eventId: 'eventB', bidType: 'when', bidId: 0 } },
                { type: RuleReactionType.BID_PLACED, rulePath: [], details: { eventId: 'never', bidType: 'when', bidId: 0 } },
            ]
        },
        { // Step 1: Engine processes asyncSet, eventA becomes pending
             effect: (ref) => { 
                 // Store assumed requestActionId
                 requestActionId = 0; // Assume actionId is 0
                 ref.actionInput = undefined; 
             },
             reactions: [
                 { type: RuleReactionType.RULE_PENDING, rulePath: ['asyncSetter'], details: { eventId: 'eventA', bidType: 'set', bidId: 0 /* , actionId: 0? */ } },
             ],
             assert: ({ engine }) => { // Check eventA state AFTER step reactions
                 const eventAFromEngine = engine.events.get('eventA');
                 assertExists(eventAFromEngine);
                 assertEquals(eventAFromEngine.isPending, true); // Check pending status
                 assertEquals(eventAFromEngine.value, undefined); // Value should be undefined while pending
             }
        },
        { // Step 2: Trigger syncSetterRule via eventB
             effect: (ref) => {
                 // ... find bidId logic (can be simplified if assuming 0) ...
                 const targetBidId = 0; // Assume syncSetter's 'when' bid is bidId 0
                 ref.actionInput = {
                      type: "input",
                      eventId: eventB.id,
                      payload: 'trySet',
                      rulePath: ['syncSetter'],
                      bidId: targetBidId,
                      id: undefined // Use undefined, not null for id if optional/not set
                 };
             },
             reactions: [
                 // syncSetter progresses off 'when' and places its 'set' bid
                 { type: RuleReactionType.RULE_PROGRESSED_ON_BID, rulePath: ['syncSetter'], details: { eventId: 'eventB', bidType: 'when', bidId: 0 } },
                 { type: RuleReactionType.RULE_REMOVED_BID, rulePath: ['syncSetter'], details: { bidId: 0 } },
                 { type: RuleReactionType.BID_PLACED, rulePath: ['syncSetter'], details: { eventId: 'eventA', bidType: 'set', bidId: 1 } }, // The blocked set
                 { type: RuleReactionType.BID_PLACED, rulePath: ['syncSetter'], details: { eventId: 'stateEvent', bidType: 'set', bidId: 2 } },
                 { type: RuleReactionType.RULE_ENDED, rulePath: ['syncSetter'] }, // Rule finishes after placing bids
             ],
             assert: ({ engine }) => { // Check state AFTER step reactions
                 const eventAFromEngine = engine.events.get('eventA');
                 const stateEventFromEngine = engine.events.get('stateEvent');
                 assertExists(eventAFromEngine);
                 assertEquals(eventAFromEngine.isPending, true); // Still pending
                 assertEquals(eventAFromEngine.value, undefined); // Value still undefined
                 assertExists(stateEventFromEngine);
                 assertEquals(stateEventFromEngine.value, 'Sync set attempted');
             }
        },
        { // Step 3: Engine attempts to process syncSetter's set(eventA) bid, finds eventA pending
             effect: (ref) => { ref.actionInput = undefined; },
             reactions: [
                 // Expect set(eventA) from syncSetter to be skipped/invalidated
                 // Reaction type might be 'action request invalid' or just removed bid? Assuming removed.
                 { type: RuleReactionType.RULE_REMOVED_BID, rulePath: ['syncSetter'], details: { bidId: 1 } }, // Blocked set(eventA) removed
                 // Engine then processes the next valid bid: set(stateEvent)
                 { type: RuleReactionType.ACTION_REQUEST_PROCESSED, details: { eventId: 'stateEvent', bidType: 'set', bidId: 2, rulePath: ['syncSetter'] } },
                 { type: RuleReactionType.EVENT_VALUE_CHANGED, eventId: 'stateEvent', value: 'Sync set attempted' },
                 { type: RuleReactionType.RULE_REMOVED_BID, rulePath: ['syncSetter'], details: { bidId: 2 } },
             ],
             assert: ({ engine }) => { // Check state AFTER step reactions
                 const eventAFromEngine = engine.events.get('eventA');
                 const stateEventFromEngine = engine.events.get('stateEvent');
                 assertExists(eventAFromEngine);
                 assertEquals(eventAFromEngine.isPending, true); // Still pending
                 assertEquals(eventAFromEngine.value, undefined); // Value still undefined
                 assertExists(stateEventFromEngine);
                 assertEquals(stateEventFromEngine.value, 'Sync set attempted');
             }
        },
        { // Step 4: Resolve the original async request
             effect: (ref) => {
                 ref.actionInput = { // Action to resolve the pending request
                     type: "resolvePendingRequest",
                     eventId: eventA.id,
                     payload: 100,
                     requestActionId: requestActionId,
                     rulePath: ['asyncSetter'],
                     bidId: 0, // Assumed originating bid ID
                     id: undefined // Use undefined
                 };
             },
             reactions: [
                 // Async request resolved
                 { type: RuleReactionType.ACTION_REQUEST_PROCESSED, details: { eventId: 'eventA', bidType: 'set', bidId: 0, rulePath: ['asyncSetter'] } },
                 { type: RuleReactionType.EVENT_VALUE_CHANGED, eventId: 'eventA', value: 100 },
                 // AsyncSetter rule progresses and ends (as it yielded only the set)
                 { type: RuleReactionType.RULE_PROGRESSED_ON_BID, rulePath: ['asyncSetter'], details: { eventId: 'eventA', bidType: 'set', bidId: 0 } },
                 { type: RuleReactionType.RULE_REMOVED_BID, rulePath: ['asyncSetter'], details: { bidId: 0 } },
                 { type: RuleReactionType.RULE_ENDED, rulePath: ['asyncSetter'] },
             ],
             assert: ({ engine }) => { // Check final state
                 const eventAFromEngine = engine.events.get('eventA');
                 const stateEventFromEngine = engine.events.get('stateEvent');
                 assertExists(eventAFromEngine);
                 assertEquals(eventAFromEngine.isPending, false); // No longer pending
                 assertEquals(eventAFromEngine.value, 100); // Value is resolved
                 assertExists(stateEventFromEngine);
                 assertEquals(stateEventFromEngine.value, 'Sync set attempted'); // State event unchanged
             }
        },
    ];

    await testSchedulerFactory( rootRule, initialEvents, steps, "PendingEvent_SetBlocked" );
});

Deno.test("Pending Event: Subsequent 'trigger' is blocked", async () => {
    eventA.reset();
    eventB.reset();
    stateEvent.reset();

    const rootRule: RuleGeneratorFunction = function*(this: Rule): RuleGenerator {
        this.rule("asyncSetter", asyncSetterRule);
        this.rule("syncTriggerer", syncTriggerRule);
        this.rule("waiter", waiterRule); // Waiter needed for trigger validation
        // Keep root alive
        yield when(new Event<void>('never'));
    };

    const initialEvents = { eventA, eventB, stateEvent };
    let requestActionId = 0; // Default assumption

    const steps: TestStep[] = [
         { // Step 0: Initial setup - asyncSet places bid, syncTrigger waits, waiter waits
             reactions: [
                 { type: RuleReactionType.RULE_ENABLED, rulePath: [] },
                 { type: RuleReactionType.RULE_ENABLED, rulePath: ['asyncSetter'] },
                 { type: RuleReactionType.BID_PLACED, rulePath: ['asyncSetter'], details: { eventId: 'eventA', bidType: 'set', bidId: 0 } },
                 { type: RuleReactionType.RULE_ENABLED, rulePath: ['syncTriggerer'] },
                 { type: RuleReactionType.BID_PLACED, rulePath: ['syncTriggerer'], details: { eventId: 'eventB', bidType: 'when', bidId: 0 } },
                 { type: RuleReactionType.RULE_ENABLED, rulePath: ['waiter'] },
                 { type: RuleReactionType.BID_PLACED, rulePath: ['waiter'], details: { eventId: 'eventA', bidType: 'when', bidId: 0 } },
                 { type: RuleReactionType.BID_PLACED, rulePath: [], details: { eventId: 'never', bidType: 'when', bidId: 0 } },
             ]
         },
         { // Step 1: Engine processes asyncSet, eventA becomes pending
             effect: (ref) => { requestActionId = 0; ref.actionInput = undefined; }, // Assume actionId 0
             reactions: [
                 { type: RuleReactionType.RULE_PENDING, rulePath: ['asyncSetter'], details: { eventId: 'eventA', bidType: 'set', bidId: 0 } },
             ],
              assert: ({ engine }) => { // Check eventA state AFTER step reactions
                 const eventAFromEngine = engine.events.get('eventA');
                 assertExists(eventAFromEngine);
                 assertEquals(eventAFromEngine.isPending, true); // Check pending status
                 assertEquals(eventAFromEngine.value, undefined); // Value should be undefined while pending
             }
         },
         { // Step 2: Trigger syncTriggererRule via eventB
             effect: (ref) => {
                  const targetBidId = 0; // Assume syncTriggerer's 'when' bid is bidId 0
                  ref.actionInput = {
                      type: "input", 
                      eventId: eventB.id, 
                      payload: 'tryTrigger',
                      rulePath: ['syncTriggerer'], 
                      bidId: targetBidId, 
                      id: undefined // Use undefined
                  };
             },
             reactions: [
                 // syncTriggerer progresses and places its 'trigger' bid
                 { type: RuleReactionType.RULE_PROGRESSED_ON_BID, rulePath: ['syncTriggerer'], details: { eventId: 'eventB', bidType: 'when', bidId: 0 } },
                 { type: RuleReactionType.RULE_REMOVED_BID, rulePath: ['syncTriggerer'], details: { bidId: 0 } },
                 // Note: Trigger places a 'set' bid internally if validated
                 { type: RuleReactionType.BID_PLACED, rulePath: ['syncTriggerer'], details: { eventId: 'eventA', bidType: 'set', bidId: 1 } }, // The blocked trigger (appears as set)
                 { type: RuleReactionType.BID_PLACED, rulePath: ['syncTriggerer'], details: { eventId: 'stateEvent', bidType: 'set', bidId: 2 } },
                 { type: RuleReactionType.RULE_ENDED, rulePath: ['syncTriggerer'] },
             ],
             assert: ({ engine }) => { // Check state AFTER step reactions
                 const eventAFromEngine = engine.events.get('eventA');
                 const stateEventFromEngine = engine.events.get('stateEvent');
                 assertExists(eventAFromEngine);
                 assertEquals(eventAFromEngine.isPending, true); // Still pending
                 assertEquals(eventAFromEngine.value, undefined); // Value still undefined
                 assertExists(stateEventFromEngine);
                 assertEquals(stateEventFromEngine.value, 'Sync trigger attempted');
             }
         },
         { // Step 3: Engine attempts to process syncTriggerer's trigger(eventA) set, finds eventA pending
             effect: (ref) => { ref.actionInput = undefined; },
             reactions: [
                 // Expect trigger(eventA) to be skipped/invalidated
                 { type: RuleReactionType.RULE_REMOVED_BID, rulePath: ['syncTriggerer'], details: { bidId: 1 } }, // Remove the invalid trigger/set
                 // Engine then processes the next valid bid: set(stateEvent)
                 { type: RuleReactionType.ACTION_REQUEST_PROCESSED, details: { eventId: 'stateEvent', bidType: 'set', bidId: 2, rulePath: ['syncTriggerer'] } },
                 { type: RuleReactionType.EVENT_VALUE_CHANGED, eventId: 'stateEvent', value: 'Sync trigger attempted' },
                 { type: RuleReactionType.RULE_REMOVED_BID, rulePath: ['syncTriggerer'], details: { bidId: 2 } },
             ],
             assert: ({ engine }) => { // Check state AFTER step reactions
                 const eventAFromEngine = engine.events.get('eventA');
                 const stateEventFromEngine = engine.events.get('stateEvent');
                 assertExists(eventAFromEngine);
                 assertEquals(eventAFromEngine.isPending, true); // Still pending
                 assertEquals(eventAFromEngine.value, undefined); // Value still undefined
                 assertExists(stateEventFromEngine);
                 assertEquals(stateEventFromEngine.value, 'Sync trigger attempted');
             }
         },
    ];

    await testSchedulerFactory( rootRule, initialEvents, steps, "PendingEvent_TriggerBlocked" );
});

// --- NEW TEST CASE ---
Deno.test("Pending Event: External 'dispatch()' is blocked", async () => {
    eventA.reset();
    eventB.reset(); // Use eventB to signal when to dispatch externally
    stateEvent.reset();

    const rootRule: RuleGeneratorFunction = function*(this: Rule): RuleGenerator {
        this.rule("asyncSetter", asyncSetterRule); // Same async setter rule
        this.rule("waiter", waiterRule);       // Need waiter to see final value
        // Simple rule to signal when the async op should be pending
        yield when(eventB, val => val === 'startAsync');
        yield set(stateEvent, 'Async Started');
        // Keep root alive
        yield when(new Event<void>('never'));
    };

    const initialEvents = { eventA, eventB, stateEvent };
    let requestActionId = 0; // Default assumption
    let testContext: any = null; // To access eventA.dispatch

    const steps: TestStep[] = [
        { // Step 0: Initial setup - asyncSet places bid, waiter waits, root waits
            reactions: [
                { type: RuleReactionType.RULE_ENABLED, rulePath: [] },
                { type: RuleReactionType.RULE_ENABLED, rulePath: ['asyncSetter'] },
                { type: RuleReactionType.BID_PLACED, rulePath: ['asyncSetter'], details: { eventId: 'eventA', bidType: 'set', bidId: 0 } },
                { type: RuleReactionType.RULE_ENABLED, rulePath: ['waiter'] },
                { type: RuleReactionType.BID_PLACED, rulePath: ['waiter'], details: { eventId: 'eventA', bidType: 'when', bidId: 0 } },
                { type: RuleReactionType.BID_PLACED, rulePath: [], details: { eventId: 'eventB', bidType: 'when', bidId: 0 } }, // Root waits on eventB
            ]
        },
        { // Step 1: Signal root rule to proceed (allows asyncSetter bid to be processed)
             effect: (ref) => {
                const contextRef = ref as any;
                testContext = contextRef; // Store context for dispatch
                contextRef.actionInput = {
                    type: "input", eventId: eventB.id, payload: 'startAsync',
                    rulePath: [], bidId: 0, id: 1 // Ensure ID is 1
                };
             },
            reactions: [
                // Root rule progresses
                { type: RuleReactionType.RULE_PROGRESSED_ON_BID, rulePath: [], details: { eventId: 'eventB', bidType: 'when', bidId: 0 } },
                { type: RuleReactionType.RULE_REMOVED_BID, rulePath: [], details: { bidId: 0 } },
                { type: RuleReactionType.BID_PLACED, rulePath: [], details: { eventId: 'stateEvent', bidType: 'set', bidId: 1 } },
                { type: RuleReactionType.BID_PLACED, rulePath: [], details: { eventId: 'never', bidType: 'when', bidId: 2 } },
                // Engine processes root's set(stateEvent)
                { type: RuleReactionType.ACTION_REQUEST_PROCESSED, details: { eventId: 'stateEvent', bidType: 'set', bidId: 1, rulePath: [] } },
                { type: RuleReactionType.EVENT_VALUE_CHANGED, eventId: 'stateEvent', value: 'Async Started' },
                { type: RuleReactionType.RULE_REMOVED_BID, rulePath: [], details: { bidId: 1 } },
            ]
        },
        { // Step 2: Engine processes asyncSet, eventA becomes pending
             effect: (ref) => {
                 const contextRef = ref as any;
                 // requestActionId = 0; // Assume asyncSetter's actionId is 0 (This assumption might be fragile)
                 // Find the actual requestActionId from the pending request
                 const pending = contextRef.eventA.getPendingRequest(); // Use casted ref
                 assertExists(pending, "EventA should have a pending request");
                 requestActionId = pending.requestActionId;
                 assertEquals(contextRef.eventA.getValue(), undefined, "EventA value before pending"); // Use casted ref
                 contextRef.actionInput = undefined;
             },
             reactions: [
                 { type: RuleReactionType.RULE_PENDING, rulePath: ['asyncSetter'], details: { eventId: 'eventA', bidType: 'set', bidId: 0 } },
             ],
             assert: ({ engine }) => {
                 const eventAFromEngine = engine.events.get('eventA');
                 assertExists(eventAFromEngine);
                 assertEquals(eventAFromEngine.isPending, true, "EventA should be pending after asyncSet");
                 assertEquals(eventAFromEngine.value, undefined, "EventA value before pending resolution");
             }
        },
        { // Step 3: Attempt external dispatch on eventA while it's pending
             effect: ({ engine, actionInput }, prevResult) => {
                // Store context if needed (already done in Step 1)
                 assertExists(testContext, "Test context should be set");
                 assertExists(testContext.eventA, "eventA should exist in test context");
                 assertExists(testContext.eventA.dispatch, "dispatch should exist on event");
                 
                 // Assert before dispatch
                 assertEquals(testContext.eventA.value, undefined, "EventA value should be undefined before dispatch attempt");
                 assert(testContext.eventA.isPending, "EventA should be pending before dispatch attempt");

                 // Use the event object from the test context to dispatch
                 testContext.eventA.dispatch(999);
                 actionInput = undefined; // Don't send any internal action
             },
             reactions: [
                 // Expect NO 'event value changed' for eventA
                 // Expect NO 'action request processed' for the dispatch
                 // Expect NO progression for 'waiter' rule
                 // The dispatch should be silently ignored/invalidated.
                 // The only reaction might be related to the dispatch action itself being invalid, if the engine generates one.
                 // Assuming silent failure for now.
             ],
             assert: ({ engine }) => { // Assert AFTER the step where dispatch was attempted
                 const eventAFromEngine = engine.events.get('eventA');
                 assertExists(eventAFromEngine);
                 assertEquals(eventAFromEngine.value, undefined, "EventA value must NOT have changed to 999 after failed dispatch");
                 assert(eventAFromEngine.isPending, "EventA should still be pending after failed dispatch attempt");
             }
        },
        { // Step 4: Resolve the original async request
             effect: ({ engine, actionInput }, prevResult) => {
                 assertExists(engine.events.get('eventA'), "EventA should exist");
                 assert(engine.events.get('eventA')?.isPending, "EventA should still be pending before resolve");
                 assertEquals(engine.events.get('eventA')?.value, undefined, "EventA value should be undefined before resolve");
                 
                 // Find requestActionId
                 const pending = engine.events.get('eventA')?.getPendingRequest();
                 assertExists(pending, "EventA should have a pending request before resolve");
                 requestActionId = pending.requestActionId;

                 // Prepare resolve action
                 actionInput = {
                     type: "resolvePendingRequest", eventId: eventA.id, payload: 100,
                     requestActionId: requestActionId, rulePath: ['asyncSetter'], bidId: 0, id: 2 // Ensure ID is 2
                 };
             },
             reactions: [
                 // Async request resolved
                 { type: RuleReactionType.ACTION_REQUEST_PROCESSED, details: { eventId: 'eventA', bidType: 'set', bidId: 0, rulePath: ['asyncSetter'] } },
                 { type: RuleReactionType.EVENT_VALUE_CHANGED, eventId: 'eventA', value: 100 },
                 // AsyncSetter rule progresses and ends
                 { type: RuleReactionType.RULE_PROGRESSED_ON_BID, rulePath: ['asyncSetter'], details: { eventId: 'eventA', bidType: 'set', bidId: 0 } },
                 { type: RuleReactionType.RULE_REMOVED_BID, rulePath: ['asyncSetter'], details: { bidId: 0 } },
                 { type: RuleReactionType.RULE_ENDED, rulePath: ['asyncSetter'] },
                 // Waiter rule should now progress because eventA changed
                 { type: RuleReactionType.RULE_PROGRESSED_ON_BID, rulePath: ['waiter'], details: { eventId: 'eventA', bidType: 'when', bidId: 0 } },
                 { type: RuleReactionType.RULE_REMOVED_BID, rulePath: ['waiter'], details: { bidId: 0 } },
                 { type: RuleReactionType.BID_PLACED, rulePath: ['waiter'], details: { eventId: 'stateEvent', bidType: 'set', bidId: 1 } }, // Waiter sets state
                 // Engine processes waiter's set bid
                 { type: RuleReactionType.ACTION_REQUEST_PROCESSED, details: { eventId: 'stateEvent', bidType: 'set', bidId: 1, rulePath: ['waiter'] } },
                 { type: RuleReactionType.EVENT_VALUE_CHANGED, eventId: 'stateEvent', value: 'Waiter got: 100' },
                 { type: RuleReactionType.RULE_REMOVED_BID, rulePath: ['waiter'], details: { bidId: 1 } },
                 // Waiter loops and places when again
                 { type: RuleReactionType.BID_PLACED, rulePath: ['waiter'], details: { eventId: 'eventA', bidType: 'when', bidId: 2 } },
             ],
             assert: ({ engine }) => {
                 const eventAFromEngine = engine.events.get('eventA');
                 const stateEventFromEngine = engine.events.get('stateEvent');
                 assertExists(eventAFromEngine);
                 assertEquals(eventAFromEngine.value, 100, "Final eventA value check");
                 assertEquals(stateEventFromEngine?.value, 'Waiter got: 100', "Final stateEvent check");
                 assert(!eventAFromEngine.isPending, "EventA should not be pending after successful resolve");
             }
        }
    ];

    await testSchedulerFactory( rootRule, initialEvents, steps, "PendingEvent_DispatchBlocked" );

    // Final assertions outside the scheduler loop (alternative way)
    assertEquals(eventA.getValue(), 100, "Final eventA value check after scheduler"); // Keep assertion as is
    assertEquals(stateEvent.getValue(), 'Waiter got: 100', "Final stateEvent check after scheduler"); // Keep assertion as is
    assert(!eventA.isPending(), "EventA should not be pending after successful resolve"); // Keep assertion as is


});

// --- TODO: Add test for external dispatch being blocked by PENDING EXTEND ---
// (Currently missing functionality for pending extend, but test structure would be similar)
// TODO: Add test for rejectPendingRequest action processing 

Deno.test("Pending Event: Internal set bid should be blocked by pending async request", () => {
    let resolveAsyncSet: ((value: string) => void) | undefined;
    let ruleBStarted = false;
    let ruleBFinished = false;

    const eventA = new Event<string>("eventA");
    const startRuleBEvent = new Event<void>("startRuleB");

    const rootFlow = function* (this: Rule): RuleGeneratorFunction {
        // Rule A: Initiates async set on eventA
        yield* this.runRule("ruleA", function* () {
            const result = yield* set(eventA, () => 
                new Promise<string>((resolve) => {
                    resolveAsyncSet = resolve;
                })
            );
            assertEquals(result.success, true, "Rule A async set should succeed initially");
        });

        // Rule B: Waits for startRuleBEvent, then tries to set eventA
        yield* this.runRule("ruleB", function* () {
            ruleBStarted = true;
            yield* startRuleBEvent.when();
            // This set should be invalid because eventA will be pending
            const result = yield* set(eventA, "sync value from ruleB");
            assertEquals(result.success, false, "Rule B sync set should fail");
            assertExists(result.reason, "Rule B set failure reason should exist");
            assertEquals(result.reason?.type, "invalid-bid", "Rule B set failure reason should be invalid-bid");
            assertEquals(result.reason?.invalidBidReason, "pending-request", "Rule B set invalid bid reason should be pending-request");
            ruleBFinished = true;
        });
    };

    testSchedulerFactory(
        rootFlow,
        { eventA, startRuleBEvent },
        [
            // Step 0: Initial bids
            {
                reactions: [
                    { type: RuleReactionType.RULE_STARTED, flowPath: ["ruleA"] },
                    // Rule A yields async set, becomes pending
                    { type: RuleReactionType.RULE_PENDING, flowPath: ["ruleA"] },
                     { type: RuleReactionType.RULE_STARTED, flowPath: ["ruleB"] },
                    // Rule B places when bid
                    { type: RuleReactionType.BID_PLACED, flowPath: ["ruleB"] },
                ],
                effect: () => {
                    assertExists(resolveAsyncSet, "resolveAsyncSet should be defined after Rule A runs");
                    assertEquals(ruleBStarted, true, "Rule B should have started");
                     assertEquals(ruleBFinished, false, "Rule B should not have finished yet");
                }
            },
            // Step 1: Trigger Rule B
            {
                actionInput: startRuleBEvent.dispatch(),
                reactions: [
                    { type: RuleReactionType.ACTION_PROCESSED, details: { eventId: startRuleBEvent.id } },
                    // Rule B's when bid is selected
                    { type: RuleReactionType.BID_SELECTED, flowPath: ["ruleB"] }, 
                    // Rule B progresses, attempts to set eventA, but it's pending.
                    // The bid is invalid, so no BID_PLACED/REMOVED/SELECTED/etc. for the set.
                    // Rule B continues and finishes.
                    { type: RuleReactionType.RULE_FINISHED, flowPath: ["ruleB"] },
                ],
                 effect: () => {
                     assertEquals(ruleBFinished, true, "Rule B should have finished after its invalid set attempt");
                 }
            },
            // Step 2: Resolve Rule A's pending request
            {
                actionInput: { // Manual ResolvePendingRequestAction
                    type: "resolvePendingRequest",
                    flowId: "test/ruleA", // Assuming default testId is "test"
                    eventId: eventA.id,
                    payload: "async value from ruleA" 
                } as ResolvePendingRequestAction<string>,
                reactions: [
                    { type: RuleReactionType.ACTION_PROCESSED }, // Processing the resolve action
                     { type: RuleReactionType.EVENT_UPDATED, details: { id: eventA.id, value: "async value from ruleA" } },
                    { type: RuleReactionType.RULE_RESOLVED, flowPath: ["ruleA"] }, // Rule A resolves
                    { type: RuleReactionType.RULE_FINISHED, flowPath: ["ruleA"] }, // Rule A finishes
                ],
                effect: (ref, prevResult) => {
                    assertEquals(eventA.value, "async value from ruleA", "eventA should have the value from Rule A's async set");
                    const eventUpdateReaction = prevResult?.reactions?.find(r => r.type === RuleReactionType.EVENT_UPDATED);
                    assertExists(eventUpdateReaction, "Event update reaction missing");
                    assertEquals(eventUpdateReaction.details.value, "async value from ruleA");
                }
            },
             // Step 3: Engine should signal finish
            {
                 reactions: [], // No more reactions expected, just engine finishing
                 effect: (ref, prevResult) => {
                    // Optional: Check if the final payload indicates finish if test setup supports it
                     // assert(prevResult?.hasFinished, "Engine should have finished");
                 }
            }
        ]
    );
}); 

// Helper to create a promise and its resolve/reject functions
function createManualPromise<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: any) => void } {
    let resolveFn: (value: T) => void;
    let rejectFn: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
        resolveFn = res;
        rejectFn = rej;
    });
    // @ts-ignore Will be assigned by promise constructor
    return { promise, resolve: resolveFn, reject: rejectFn };
}

Deno.test('Pending Event: Set bid fails while pending', () => {
    const eventA = new Event<string>('eventA');
    let asyncSetPromise = createManualPromise<string>();

    // Rule that initiates the async set
    function* ruleAsyncSet(this: Rule): RuleGenerator {
        yield set(eventA, () => asyncSetPromise.promise);
    }

    // Rule that tries to set synchronously while pending
    function* ruleSyncSet(this: Rule): RuleGenerator {
        yield set(eventA, 'sync value');
        // This rule should finish after its set bid is (implicitly) invalidated
    }

    const steps: TestStep[] = [
        { // Step 0: Initial bids placed
            reactions: [
                { type: RuleReactionType.RULE_ENABLED, flowPath: ['ruleAsyncSet'] },
                { type: RuleReactionType.BID_PLACED, flowPath: ['ruleAsyncSet'], details: { bidType: 'set' } },
                { type: RuleReactionType.RULE_ENABLED, flowPath: ['ruleSyncSet'] },
                { type: RuleReactionType.BID_PLACED, flowPath: ['ruleSyncSet'], details: { bidType: 'set' } },
            ],
        },
        { // Step 1: ruleAsyncSet's async set is processed -> eventA is pending
            actionInput: undefined, // Engine selects ruleAsyncSet
            reactions: [
                { type: RuleReactionType.PENDING_REQUEST_ADDED, flowPath: ['ruleAsyncSet'], details: { eventId: 'eventA' } },
                // ruleSyncSet's bid is implicitly invalidated because eventA is pending,
                // so it does not get processed and the rule ends immediately.
                { type: RuleReactionType.RULE_ENDED, flowPath: ['ruleSyncSet'] }
            ],
        },
        { // Step 2: Resolve the async request
            actionInput: { type: 'resolvePendingRequest', eventId: eventA.id, payload: 'async value' },
            reactions: [
                { type: RuleReactionType.PENDING_REQUEST_RESOLVED, flowPath: ['ruleAsyncSet'], details: { eventId: 'eventA', value: 'async value' } },
                { type: RuleReactionType.RULE_PROGRESSED_ON_BID, flowPath: ['ruleAsyncSet'], details: { bidType: 'set', value: 'async value' } },
                { type: RuleReactionType.RULE_ENDED, flowPath: ['ruleAsyncSet'] }
            ],
        },
    ];

    testSchedulerFactory(
        function* root() {
            yield ruleAsyncSet;
            yield ruleSyncSet;
        },
        { eventA },
        steps,
        'pendingSetTest'
    );
});


Deno.test('Pending Event: Trigger bid fails while pending', () => {
    const eventA = new Event<string>('eventA');
    const eventB = new Event<void>('eventB'); // Trigger for ruleTrigger
    let asyncSetPromise = createManualPromise<string>();

    // Rule that initiates the async set
    function* ruleAsyncSet(this: Rule): RuleGenerator {
        yield set(eventA, () => asyncSetPromise.promise);
        // Rule ends after async completes
    }

    // Rule that tries to trigger while pending
    function* ruleTrigger(this: Rule): RuleGenerator {
        yield* this.when(eventB);
        const result = yield trigger(eventA, 'trigger value');
        // Trigger should be invalidated, result should reflect this (e.g., invalid bid reason)
        // We will check reactions to confirm rule ends without progressing post-trigger
    }

    const steps: TestStep[] = [
        { // Step 0: Initial bids
            reactions: [
                { type: RuleReactionType.RULE_ENABLED, flowPath: ['ruleAsyncSet'] },
                { type: RuleReactionType.BID_PLACED, flowPath: ['ruleAsyncSet'], details: { bidType: 'set' } },
                { type: RuleReactionType.RULE_ENABLED, flowPath: ['ruleTrigger'] },
                { type: RuleReactionType.BID_PLACED, flowPath: ['ruleTrigger'], details: { bidType: 'when' } },
            ],
        },
        { // Step 1: Process ruleAsyncSet's async set -> eventA pending
            actionInput: undefined, // Engine selects ruleAsyncSet
            reactions: [
                { type: RuleReactionType.PENDING_REQUEST_ADDED, flowPath: ['ruleAsyncSet'], details: { eventId: 'eventA' } },
            ],
        },
        { // Step 2: Dispatch eventB to activate ruleTrigger
            actionInput: { type: 'dispatch', eventId: eventB.id, payload: undefined, id: 1 },
            reactions: [
                { type: RuleReactionType.RULE_PROGRESSED_ON_BID, flowPath: ['ruleTrigger'], details: { bidType: 'when' } },
                { type: RuleReactionType.BID_PLACED, flowPath: ['ruleTrigger'], details: { bidType: 'trigger' } }, // Trigger bid is placed
            ],
        },
        { // Step 3: Engine attempts to process ruleTrigger's trigger bid, but fails due to pendingRequest
            actionInput: undefined, // Engine selects ruleTrigger's trigger bid
            reactions: [
                // Expecting the trigger bid to be invalidated and removed.
                // The rule progresses past the yield trigger, but since it was invalid, no 'rule progressed on a bid' for the trigger.
                // The rule then ends because there are no more instructions.
                { type: RuleReactionType.RULE_ENDED, flowPath: ['ruleTrigger'] }
            ],
        },
         { // Step 4: Resolve the async request
            actionInput: { type: 'resolvePendingRequest', eventId: eventA.id, payload: 'async value' },
            reactions: [
                { type: RuleReactionType.PENDING_REQUEST_RESOLVED, flowPath: ['ruleAsyncSet'], details: { eventId: 'eventA', value: 'async value' } },
                { type: RuleReactionType.RULE_PROGRESSED_ON_BID, flowPath: ['ruleAsyncSet'], details: { bidType: 'set', value: 'async value' } },
                { type: RuleReactionType.RULE_ENDED, flowPath: ['ruleAsyncSet'] }
            ],
        },
    ];

     testSchedulerFactory(
        function* root() {
            yield ruleAsyncSet;
            yield ruleTrigger;
        },
        { eventA, eventB },
        steps,
        'pendingTriggerTest'
    );
});


Deno.test('Pending Event: Dispatch action fails while pending', () => {
    const eventA = new Event<string>('eventA');
    let asyncSetPromise = createManualPromise<string>();

    // Rule that initiates the async set
    function* ruleAsyncSet(this: Rule): RuleGenerator {
        yield set(eventA, () => asyncSetPromise.promise);
        // Rule ends after async completes
    }

     // Rule that waits for eventA (needed for dispatch validation)
    function* ruleWaiter(this: Rule): RuleGenerator {
        yield* this.when(eventA);
        // This rule should not progress until the async set resolves
    }


    const steps: TestStep[] = [
        { // Step 0: Initial bids
            reactions: [
                { type: RuleReactionType.RULE_ENABLED, flowPath: ['ruleAsyncSet'] },
                { type: RuleReactionType.BID_PLACED, flowPath: ['ruleAsyncSet'], details: { bidType: 'set' } },
                 { type: RuleReactionType.RULE_ENABLED, flowPath: ['ruleWaiter'] },
                { type: RuleReactionType.BID_PLACED, flowPath: ['ruleWaiter'], details: { bidType: 'when' } },
            ],
        },
        { // Step 1: Process ruleAsyncSet's async set -> eventA pending
            actionInput: undefined, // Engine selects ruleAsyncSet
            reactions: [
                { type: RuleReactionType.PENDING_REQUEST_ADDED, flowPath: ['ruleAsyncSet'], details: { eventId: 'eventA' } },
            ],
        },
        { // Step 2: Dispatch eventA - should be rejected
            actionInput: { type: 'dispatch', eventId: eventA.id, payload: 'dispatch value', id: 1 },
            expectRejection: true, // We expect this action to be rejected
            reactions: [], // No rule reactions because the action is rejected
        },
        { // Step 3: Resolve the async request
            actionInput: { type: 'resolvePendingRequest', eventId: eventA.id, payload: 'async value' },
            reactions: [
                { type: RuleReactionType.PENDING_REQUEST_RESOLVED, flowPath: ['ruleAsyncSet'], details: { eventId: 'eventA', value: 'async value' } },
                { type: RuleReactionType.RULE_PROGRESSED_ON_BID, flowPath: ['ruleAsyncSet'], details: { bidType: 'set', value: 'async value' } },
                { type: RuleReactionType.RULE_ENDED, flowPath: ['ruleAsyncSet'] },
                // Now that eventA is resolved, ruleWaiter should progress
                { type: RuleReactionType.RULE_PROGRESSED_ON_BID, flowPath: ['ruleWaiter'], details: { bidType: 'when', value: 'async value' } },
                { type: RuleReactionType.RULE_ENDED, flowPath: ['ruleWaiter'] }, // ruleWaiter ends after when
            ],
        },
    ];

    testSchedulerFactory(
        function* root() {
            yield ruleAsyncSet;
            yield ruleWaiter;
        },
        { eventA },
        steps,
        'pendingDispatchTest'
    );

    // Final assertion: Check the value of eventA after resolution
    assertEquals(eventA.value, 'async value');
}); 