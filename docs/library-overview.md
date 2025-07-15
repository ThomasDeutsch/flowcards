# FlowCards Library Overview

This document provides an overview of the FlowCards library, explaining its core concepts and how to use it to model system behavior using flows, events, and bids. The library allows describing complex, asynchronous, and interactive systems in a structured way, inspired by state machines and behavioral programming.

## Core Concepts

### Flows

Flows are the fundamental building blocks of a FlowCards system. They represent individual processes, behaviors, or rules within the system.

*   **Definition:** Flows are defined using JavaScript generator functions (`function*`).
*   **Execution:** The library's scheduler runs these generator functions, progressing them based on the bids they yield.
*   **State:** Flows can maintain internal state using standard JavaScript variables within their scope.
*   **Hierarchy:** Flows can create child flows using `this.flow(name, generatorFn, parameters)`, allowing for modular and hierarchical system design.

### Events

Events are typed containers that hold state and act as communication channels between flows.

*   **Definition:** Events are created using `new Event<T>(name)`, where `T` is the type of the value the event will hold.
*   **State:** The current value of an event can be accessed via `event.value`. Events can also be `pending` during asynchronous operations.
*   **Interaction:** Flows interact with events primarily through bids.

### Bids

Bids are objects yielded by flows to interact with the scheduler and events. They declare the flow's intentions, such as waiting for something, requesting a state change, or offering to handle an event. The scheduler evaluates bids from all active flows to determine the next step in the system's execution.

*(Bid types will be detailed in the next section)*

### Scheduler

The scheduler is the engine that runs the flows. It collects bids from all active flows in each "tick", selects which bids can proceed based on event states and priorities, and progresses the corresponding flows. You typically interact with it via a setup function (like `testSchedulerFactory` seen in tests) which initializes and runs the main flow(s).

## Bids: Flow Interaction Language

Flows communicate their intentions and interact with events using different types of bids yielded from their generator function.

### `request(event, valueOrFn, [validationFn])`

*   **Purpose:** Proposes an update to an event's value.
*   **Value:** Can be a direct value (`request(eventA, 101)`) or a function (`request(eventA, () => computeValue())`).
*   **Asynchronous:** If `valueOrFn` is a function returning a Promise, the `request` becomes asynchronous. The event is marked as `pending` (`event.isPending === true`) until the promise resolves. The flow only progresses after the promise settles (and validation passes).
*   **Validation:** An optional `validationFn(resolvedValue)` can be provided. It's checked *after* the value/promise resolves. If it returns `false`, the bid is considered invalid, and the request might fail or be ignored (depending on scheduler logic and other bids).
*   **Concurrency:** If multiple flows `request` the same event, the scheduler decides which one proceeds (tests suggest higher priority/later bids might override earlier ones, but specifics depend on scheduler implementation).
*   **Example (`request-bid.test.ts`):
    ```typescript
    const eventA = new Event<number>('eventA');

    // Simple request
    yield request(eventA, 101);
    // eventA.value is now 101

    // Async request with function
    yield request(eventA, () => delay(100, 202)); // Assuming delay returns a Promise
    // eventA.isPending is true
    // ...later, after promise resolves...
    // eventA.isPending is false, eventA.value is 202

    // Request with validation
    yield request(eventA, 303, (value) => value > 300); // Only proceeds if value > 300
    ```

### `waitFor(event)`

*   **Purpose:** Pauses the flow until the specified `event` is updated (typically by a `request` bid elsewhere).
*   **Behavior:** The flow remains suspended at the `yield` statement until the scheduler processes a successful update to `event`.
*   **Example (`request-bid.test.ts`):
    ```typescript
    const eventA = new Event<number>('eventA');

    this.flow('requester', function*() {
        yield request(eventA, 101); // Update eventA
    }, []);

    this.flow('waiter', function*() {
        yield waitFor(eventA); // Wait for eventA update
        // This line is reached only after eventA is set to 101
        console.log(`Event A updated to: ${eventA.value}`); // Logs 101
    }, []);
    ```

### `askFor(event, [validationFn])`

*   **Purpose:** Pauses the flow until the `event` is explicitly *triggered* by another flow or external action.
*   **Behavior:** Unlike `waitFor`, `askFor` doesn't react to simple state changes from `request`. It requires a corresponding `trigger` action.
*   **Validation:** Can include a `validationFn(triggeredValue)` to validate the payload supplied by the `trigger`. If validation fails, the trigger action fails (throws/rejects).
*   **Enabling Trigger:** Placing an `askFor` bid makes the event eligible to be triggered via `event.trigger(value)` from outside the flow system or via a `trigger` bid.
*   **Checking Validity:** You can check if a potential trigger value is valid using `event.isValid(value)`.
*   **Example (`askFor-and-trigger.test.ts`):
    ```typescript
    const eventA = new Event<number>('eventA');

    this.flow('asker', function*() {
        yield askFor(eventA, (value) => value > 10); // Wait for trigger, require value > 10
        console.log(`Event A triggered with: ${eventA.value}`);
    }, []);

    this.flow('triggerer', function*() {
        yield trigger(eventA, 15); // Trigger eventA with valid value
    }, []);

    // Elsewhere (e.g., UI event handler):
    if (eventA.isValid(20)) {
        eventA.trigger(20); // External trigger
    }
    ```

### `trigger(event, valueOrFn)`

*   **Purpose:** Actively triggers an `event` that another flow is waiting for via an `askFor` bid.
*   **Behavior:** Provides the value to satisfy the `askFor` bid. The flow waiting with `askFor` will resume if the trigger is valid.
*   **Value/Validation:** The `valueOrFn` is passed to the `askFor` validation function (if any). If validation fails, `trigger` throws an error (or rejects if async).
*   **Asynchronous:** Can accept a function returning a Promise for asynchronous triggering.
*   **Example:** (See `askFor` example above)

### `extend(event, [validationFn])`

*   **Purpose:** Allows a flow to intercept and potentially modify or react to another bid (`request`, `askFor`, etc.) placed on the same `event`.
*   **Mechanism:** When a bid on `event` is selected by the scheduler, any active `extend(event)` bids intercept it.
    1.  The original bid is paused.
    2.  The `event` becomes `pending`.
    3.  The *extending* flow progresses.
    4.  The extending flow can inspect the value that *would* have been set using `event.extendedValue`.
    5.  The extending flow can then decide:
        *   Override the value with its own `request(event, newValue)`.
        *   Perform other actions.
        *   Let the original bid proceed by doing nothing or ending.
        *   Abort the interception using `this.abortExtend(event)`.
*   **Validation:** An optional `validationFn(value)` determines if the `extend` should activate based on the intercepted bid's value.
*   **Example (`extend-bid.test.ts`):
    ```typescript
    const eventA = new Event<number>('eventA');

    this.flow('requester', function*() {
        yield request(eventA, 100);
        // Resumes only after extender is done, potentially with a different value
        console.log(`Request completed, value: ${eventA.value}`); // Might be 100 or 1000
    }, []);

    this.flow('extender', function*() {
        yield extend(eventA); // Intercept requests for eventA
        if (eventA.extendedValue === 100) {
            // Modify the outcome
            yield request(eventA, 1000);
        }
        // If no request is made here, the original request(eventA, 100) proceeds after this flow yields/ends.
    }, []);
    ```

### `block(event, conditionFn)`

*   **Purpose:** Prevents bids on the specified `event` from progressing if the `conditionFn` returns `true`.
*   **Behavior:** Acts as a conditional guard for an event.
*   **Example (`request-bid.test.ts`):
    ```typescript
    const eventA = new Event<number>('eventA');
    let allowRequest = false;

    this.flow('blocker', function*() {
        yield block(eventA, () => !allowRequest); // Block requests unless allowRequest is true
    }, []);

    this.flow('requester', function*() {
        // This request will be blocked initially
        yield request(eventA, 1);
        console.log('Request 1 progressed'); // Won't log until allowRequest is true
    }, []);

    // Later...
    allowRequest = true; // Unblocks eventA
    // Now the request(eventA, 1) can proceed in the next scheduler cycle.
    ```

## Flow Lifecycle and Management

### Creation and Termination

*   Flows are created using `this.flow(...)`.
*   They terminate naturally when their generator function completes.
*   A parent flow can terminate its children using `this.endFlows()`.

### Contexts and Enabling/Disabling Flows

*   Flows can be grouped into contexts using `this.context(contextId, callback)`.
*   Only flows defined within active contexts are enabled. Flows in inactive contexts are `disabled` (`flow.isDisabled === true`).
*   Disabled flows do not place bids.
*   This allows dynamically enabling or disabling parts of the system logic based on conditions evaluated by the parent flow.

### Cleanup

*   Flows can register cleanup logic using `this.cleanup(callback)`.
*   The callback is executed when the flow terminates (either normally or due to being reset/ended).

## Examples

*(Examples combining these concepts will be added here)* 