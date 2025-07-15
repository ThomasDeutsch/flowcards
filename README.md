# FlowCards LLM Documentation & Usage Guide

This document provides a guide for understanding and using the FlowCards library, targeted at Large Language Models assisting with code generation and comprehension.

**1. Purpose & Core Principles**

*   **Purpose:** FlowCards is a TypeScript library for modeling reactive application behavior using declarative rules based on generator functions. It excels at managing complex, event-driven flows, including state dependencies and asynchronous operations.
*   **Core Principles:**
    *   **Declarative Rules:** Define *what* should happen in response to events, mapping closely to user stories or system requirements.
    *   **Event-Driven:** Rules react to changes in `Event` objects.
    *   **Synchronized Generators:** `Rule`s are implemented as generator functions. The `yield` keyword synchronizes rule execution, allowing the `Engine` to manage bids and process actions consistently.
    *   **Bid-Based Intent:** Rules don't directly cause actions; they place `Bid`s expressing their intent (e.g., "wait for event X", "request update Y").
    *   **Testability:** The flow of actions and reactions provides a clear mechanism for testing.

**2. Key Components & API**

*   **`Event<PayloadType>` (`core/event.ts`)**
    *   **Concept:** Represents a piece of state or a trigger point in the system. Can hold a value (`PayloadType`).
    *   **Creation:** `const myEvent = new Event<string>('myEventId');`
    *   **State:** Use `.value` getter (read-only snapshot) and `.hasValue` boolean.
    *   **Triggering (External/UI):** `myEvent.dispatch(newValue);` - This validates the payload against waiting `when` bids and queues an `InputAction` for the `Engine`. Throws if invalid.
    *   **Internal Setting (via Engine):** The engine uses `event.__setValue()` internally when processing `set` bids or resolving async actions.
    *   **Resetting (for Tests):** `event.reset()` clears value, state, and engine connections. Crucial for isolating test cases.
    *   **Describing Intent:** Use `event.setDescription('human-readable description')` to add context for developers and LLMs about the event's purpose.

*   **`Rule` / `RuleGeneratorFunction` (`core/rule.ts`)**
    *   **Concept:** A generator function defining a behavioral flow. It interacts with the system by yielding `Bid`s.
    *   **Signature:** `type RuleGeneratorFunction = (this: Rule) => RuleGenerator;`
    *   **Definition:** `const myRule: RuleGeneratorFunction = function*(this: Rule): RuleGenerator { /* yield bids */ };` (Note: Explicit `: RuleGenerator` annotation is often needed for type checking).
    *   **`this` Context:** Provides access to rule-specific methods:
        *   `this.rule(id, generatorFn, ...)`: Creates and manages a nested child rule.
        *   `this.endChildRules([ids])`: Ends specific or all child rules.
        *   `this.restart([condition])`: Restarts the current rule's generator.
        *   `this.cleanup(callback)`: Registers a function to run when the rule ends.
        *   `this.id`, `this.path`: Access rule identifier information.
    *   **Internal Methods:** Methods prefixed with double underscore (`__`) are strictly internal and should only be used by the engine and the rule itself. External code, including tests, should never call these methods directly. Examples of internal methods include `__end()`, `__onEvent()`, `__restart()`, `__getBidsAndPendingInformation()`, `__resolvePendingRequest()`, and other similarly prefixed methods. These are implementation details of the Rule class and are subject to change without notice.

*   **`Bid` Types (`core/bid.ts`)**
    *   **Concept:** Objects yielded by rules to the engine, declaring intent.
    *   **`when(event, [validateFn])`**:
        *   `yield when(myEvent, (payload) => payload > 0);`
        *   Pauses rule until `myEvent` is dispatched with a payload satisfying `validateFn`.
        *   Receives `[progressedEvent, remainingBids?]` when resumed. Access payload via `progressedEvent.value`.
    *   **`given(event, [options])`**:
        *   `const eventValue = yield* given(myEvent, { validate: (p) => p !== null });`
        *   Pauses rule until `myEvent` has a value satisfying validation. Progresses immediately if already valid.
        *   Must use `yield*` because `given` is itself a generator.
        *   Returns the event's value directly when resumed.
    *   **`set(event, payload | asyncFn)`**:
        *   `yield set(myEvent, newValue);`
        *   `yield set(myEvent, () => fetchNewValue());` // For async updates
        *   Requests an update to `myEvent`. Does not pause the rule significantly (microtask pause for async). The engine processes this request, updates the event value, and triggers relevant `when` bids in subsequent cycles.
    *   **`trigger(event, payload | asyncFn)`**:
        *   `yield trigger(myEvent, newValue);`
        *   Similar to `set`, but acts as a conditional request. It only progresses to update the event's value if:
            1. There is at least one rule currently waiting on `myEvent` with a `when(myEvent, ...)` bid.
            2. The provided `payload` is valid according to the validation function of at least one of those `when` bids.
        *   If these conditions are not met, the trigger is effectively ignored by the engine.
        *   Useful for scenarios where an action should only occur if another part of the system is explicitly ready to receive it (e.g., sending data only if a receiver is listening).
    *   **`extend(event, [options])`**: More advanced. Allows a rule to intercept and potentially modify the processing of bids placed by other rules on the same `event`.

*   **`Engine` (`core/engine.ts`)**
    *   **Concept:** The central coordinator. Manages rules, events, and the execution loop.
    *   **Creation:** `new Engine({ id: 'engineId', rootRule: myRootRuleGenerator, createTester?: testGeneratorFn });`
    *   **Running:** `engine.run([initialAction]);` - Starts the engine loop. Can optionally take an initial action to process.
    *   **Testing:** The `createTester` property accepts a special generator (`TestGenerator`) used by the test harness to inject actions and observe results step-by-step.
    *   **Run Loop Logic:** The engine operates in discrete steps within its `run()` method:
        1.  **Initial Action:** If `run()` is called with an action (e.g., user input via `event.dispatch()`, or resolving an async request), that action is processed first. This might progress rules and change event values.
        2.  **Initial Rule Execution & Bids:** The engine executes the root rule and any newly enabled child rules *up to their first `yield` statement*. The bids yielded at this point are collected. **Important:** Rules pause immediately after this first yield; subsequent `yield` statements within the same rule will only execute after the engine processes the first yielded bid and resumes the rule in a later step.
        3.  **Update Bids:** The engine recalculates the current state of all active bids based on the initial yields and any state changes from the initial action.
        4.  **Main Processing Loop:** The engine enters a loop that continues as long as there's work to do.
        5.  **Test Injection (Optional):** If using the test harness (`createTester`), the engine yields results to the test generator and may receive a new action or a mock request command to process.
        6.  **Process Internal Requests:** If no action came from the tester, the engine looks for the highest-priority valid pending request bid (`set` or `trigger`). Validity checks include:
            *   Bid-specific validators (`validate` function).
            *   Influence of `extend` bids.
            *   For `trigger` bids: Existence and validation of corresponding `when` bids.
        7.  **Execute Request:** If a valid request bid is found, it's processed. This typically involves updating the target event's value using `event.__setValue()`. Processing a request also removes that bid. If an invalid request bid (e.g., a `trigger` with no valid `when`) is encountered and it's the only pending work, the engine might finish immediately (Step 9).
        8.  **Trigger Reactions & Resume Rules:** Setting an event's value automatically triggers the validation and potential progression of any rules waiting on that event via `when` bids. Rules that placed the processed request bid (from step 7) or progressed on a `when` bid are resumed and continue execution until their next `yield` or they complete. New bids placed by resumed rules are added to the pending list.
        9.  **Loop or Exit:** If any action or internal request was processed, or if rules were resumed/progressed in steps 5-8, the engine updates the bid list (step 3) and repeats the loop (step 4). If no work was done (no test action, no valid internal requests, no rules progressed), the loop exits.
        10. **Notify Listeners:** After the loop finishes, external listeners attached to events that changed during the run are notified.
    *   **Async Considerations:** When processing an async `set` or `trigger` bid, the engine queues the request internally and the originating rule enters a pending state. The engine typically doesn't produce immediate reactions for this queuing in the test harness. Testing requires explicitly yielding a `ResolvePendingRequestAction` (or `RejectPendingRequestAction`) in a subsequent test step, often requiring careful handling or assumptions about the original `requestActionId` if not exposed via specific logger reactions.

*   **`Action` (`core/action.ts`)**
    *   **Concept:** Internal messages representing events being processed (e.g., `InputAction`, `ResolvePendingRequestAction`). Usually an implementation detail, but visible in test results.

*   **`Reaction` (`core/rule-reactions.ts`, logged via `core/action-reaction-logger.ts`)**
    *   **Concept:** Log entries generated by rules and the engine during execution (e.g., `rule enabled`, `bid placed`, `rule progressed on a bid`).
    *   **Primary Use:** Testing and debugging. Asserting the sequence of reactions verifies the flow's behavior.

**3. Testing Your Flows**

*   **Philosophy:** Test flows by simulating input actions/events and asserting the sequence of reactions produced by the engine.
*   **Recommended Harness:** Use/adapt `testSchedulerFactory` and `assertReactionsMatch` from `new-tests/test-utils.ts`. Avoid the internal `core/test-utils.ts`.
*   **Setup:**
    1.  Create a test utility file in your project (e.g., `my-project/tests/flow-test-utils.ts`) and copy the contents of `new-tests/test-utils.ts` into it. Adjust relative paths for core imports (`../core/` -> `path/to/flowcards/core/`).
    2.  Organize tests logically (e.g., one file per major feature flow).
    3.  Import `testSchedulerFactory`, `assertReactionsMatch`, `TestStep` from your utility file.
*   **Writing Tests:**
    1.  Define necessary `Event` objects.
    2.  Define the `RuleGeneratorFunction` (the flow) to test.
    3.  Call `testSchedulerFactory`, passing:
        *   The rule function.
        *   An object mapping event IDs to `Event` instances (`initialEvents`). Set initial values here if needed (`event.__setValue(...)`). **Remember to `event.reset()` between test cases within the same `Deno.test` block if reusing events.**
        *   An array of `TestStep` objects.
    4.  Each `TestStep` defines:
        *   `effect`: (Optional) A function to run *before* the engine processes the step. Use `ref.actionInput = {...}` to create and yield an action to the engine.
        *   `expectRejection: boolean`: (Optional) Set to `true` if the action yielded by `effect` is expected to be rejected by the engine (e.g., due to validation failure).
        *   `reactions: any[]`: An array of expected reaction objects for that step. Use `{}` for details if not asserting specific details.
*   **Debugging:** Use `console.log` inside rules and effects. Examine the detailed diffs provided by `assertReactionsMatch` on failure. Check the `invalidActionInfo` logged by the test harness when an action is rejected.

**4. Rule Reusability (while(true))**

*   **Concept:** Rules are often designed to handle a single trigger and then end (like the To-Do examples). However, many real-world scenarios require a rule to persist and react to multiple triggers over time (e.g., handling multiple clicks on the same button, processing items from a queue).
*   **Implementation:** This is typically achieved by wrapping the core logic of the rule (usually the `yield when(...)` and `yield set(...)` sequence) inside a `while(true)` loop.
    ```typescript
    const handleMultipleTriggersRule = function*(this: Rule): RuleGenerator {
        while (true) {
            const [trigger] = yield when(someTriggerEvent);
            // Process the trigger payload
            const result = processData(trigger.value);
            yield set(someStateEvent, result);
            // Loop continues, waiting for the next trigger
        }
    };
    ```
*   **Considerations:**
    *   When implementing reusable rules, the AI assistant and the human developer should carefully consider if this pattern is appropriate for the specific use case. Does the rule need to maintain internal state across multiple triggers? Should it be restarted under certain conditions?
    *   Ending reusable rules usually requires explicit logic, perhaps involving another event or a call to `this.endChildRules()` from a parent rule.

**5. Key Files for LLM Context**

When analyzing or generating FlowCards code, focus on:
*   `core/index.ts` (for top-level exports)
*   `core/rule.ts` (Rule class, `this` context methods)
*   `core/bid.ts` (`when`, `given`, `set`, etc. definitions)
*   `core/event.ts` (Event class API)
*   `core/engine.ts` (Engine initialization and run loop logic)
*   `core/action-reaction-logger.ts` (`ActionAndReactions` type)
*   `core/rule-reactions.ts` (`RuleReactionType` definition)
*   `core/test-utils.ts` (for understanding the testing pattern)
