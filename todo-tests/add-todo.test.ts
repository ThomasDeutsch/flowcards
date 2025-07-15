import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { addTodoRule, addTodoTrigger, todosEvent, Todo } from "./todo-rules.ts";
import { testSchedulerFactory, TestStep } from "./test-utils.ts"; 

Deno.test("Add Todo Rule: Adds a todo when triggered", () => {
    // Ensure event is clean before test
    todosEvent.reset();
    addTodoTrigger.reset();

    const initialTodos: Todo[] = [];
    todosEvent.__setValue(initialTodos); // Set initial value for the rule

    testSchedulerFactory(addTodoRule, { todosEvent, addTodoTrigger }, [
        {
            // Step 0: Rule starts, waits for addTodoTrigger
            reactions: [
                { flowPath: [], type: 'rule enabled' },
                { flowPath: [], type: 'bid placed', details: { bidType: 'when', eventId: addTodoTrigger.id } },
            ]
        },
        {
            // Step 1: Dispatch trigger to add "Test Todo"
            effect: (ref, prevResult) => {
                const placedWhenBid = prevResult?.reactions?.find(
                    (r: any) => r.type === 'bid placed' && r.details?.bidType === 'when' && r.details?.eventId === addTodoTrigger.id
                );
                const bidId = placedWhenBid?.details?.bidId;
                assert(typeof bidId === 'number', "Could not find when bid id");

                ref.actionInput = { 
                    type: "input", 
                    payload: "Test Todo", // Payload is the todo text
                    eventId: addTodoTrigger.id, 
                    rulePath: [], 
                    bidId: bidId,
                    id: null 
                }; 
            },
            // Rule progresses on trigger, places set bid for todosEvent
            reactions: [
                 { flowPath: [], type: 'rule progressed on a bid', details: { bidType: 'when', eventId: addTodoTrigger.id } },
                 { flowPath: [], type: 'bid placed', details: { bidType: 'set', eventId: todosEvent.id } }
            ]
        },
        {
             // Step 2: Engine processes the set bid, rule ends
             reactions: [
                 { flowPath: [], type: 'rule progressed on a bid', details: { bidType: 'set', eventId: todosEvent.id } },
                 { flowPath: [], type: 'rule ended' } 
             ]
         }
    ], "AddTodoRule_Basic");

    // Note: We are not asserting the final state of todosEvent here,
    // as that requires processing the set request, which the basic
    // test harness doesn't automatically do.
});

Deno.test("Add Todo Rule: Ignores empty trigger payload", () => {
    todosEvent.reset();
    addTodoTrigger.reset();

    const initialTodos: Todo[] = [];
    todosEvent.__setValue(initialTodos);

    testSchedulerFactory(addTodoRule, { todosEvent, addTodoTrigger }, [
        {
            // Step 0: Rule starts, waits for addTodoTrigger
            reactions: [
                { flowPath: [], type: 'rule enabled' },
                { flowPath: [], type: 'bid placed', details: { bidType: 'when', eventId: addTodoTrigger.id } },
            ]
        },
        {
            // Step 1: Dispatch trigger with empty string
            effect: (ref, prevResult) => {
                const placedWhenBid = prevResult?.reactions?.find(
                    (r: any) => r.type === 'bid placed' && r.details?.bidType === 'when' && r.details?.eventId === addTodoTrigger.id
                );
                const bidId = placedWhenBid?.details?.bidId;
                assert(typeof bidId === 'number', "Could not find when bid id");
                ref.actionInput = { type: "input", payload: "", eventId: addTodoTrigger.id, rulePath: [], bidId: bidId, id: null }; 
            },
            // Rule progresses on trigger but should return early and end without placing set bid
            reactions: [
                 { flowPath: [], type: 'rule progressed on a bid', details: { bidType: 'when', eventId: addTodoTrigger.id } },
                 { flowPath: [], type: 'rule ended' } // Rule ends because it returns early
            ]
        }
    ], "AddTodoRule_EmptyPayload");
}); 