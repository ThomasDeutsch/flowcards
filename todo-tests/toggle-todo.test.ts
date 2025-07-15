import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { toggleTodoRule, toggleTodoTrigger, todosEvent, Todo } from "./todo-rules.ts";
import { testSchedulerFactory, TestStep } from "./test-utils.ts"; 

Deno.test("Toggle Todo Rule: Toggles a todo when triggered", () => {
    todosEvent.reset();
    toggleTodoTrigger.reset();

    const initialTodos: Todo[] = [
        { id: 1, text: "Test 1", completed: false },
        { id: 2, text: "Test 2", completed: true },
    ];
    todosEvent.__setValue(initialTodos);
    const idToToggle = 1;

    testSchedulerFactory(toggleTodoRule, { todosEvent, toggleTodoTrigger }, [
        {
            // Step 0: Rule starts, waits for toggleTodoTrigger
            reactions: [
                { flowPath: [], type: 'rule enabled' },
                { flowPath: [], type: 'bid placed', details: { bidType: 'when', eventId: toggleTodoTrigger.id } },
            ]
        },
        {
            // Step 1: Dispatch trigger to toggle ID 1
            effect: (ref, prevResult) => {
                const placedWhenBid = prevResult?.reactions?.find(
                    (r: any) => r.type === 'bid placed' && r.details?.bidType === 'when' && r.details?.eventId === toggleTodoTrigger.id
                );
                const bidId = placedWhenBid?.details?.bidId;
                assert(typeof bidId === 'number', "Could not find when bid id");

                ref.actionInput = { 
                    type: "input", 
                    payload: idToToggle, // Payload is the todo ID
                    eventId: toggleTodoTrigger.id, 
                    rulePath: [], 
                    bidId: bidId,
                    id: null 
                }; 
            },
            // Rule progresses on trigger, places set bid for todosEvent
            reactions: [
                 { flowPath: [], type: 'rule progressed on a bid', details: { bidType: 'when', eventId: toggleTodoTrigger.id } },
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
    ], "ToggleTodoRule_Basic");

    // Note: We are not asserting the final state of todosEvent here.
});

Deno.test("Toggle Todo Rule: Ignores invalid trigger payload", () => {
    todosEvent.reset();
    toggleTodoTrigger.reset();

    const initialTodos: Todo[] = [{ id: 1, text: "Test 1", completed: false }];
    todosEvent.__setValue(initialTodos);

    testSchedulerFactory(toggleTodoRule, { todosEvent, toggleTodoTrigger }, [
        {
            // Step 0: Rule starts, waits for toggleTodoTrigger
            reactions: [
                { flowPath: [], type: 'rule enabled' },
                { flowPath: [], type: 'bid placed', details: { bidType: 'when', eventId: toggleTodoTrigger.id } },
            ]
        },
        {
            // Step 1: Dispatch trigger with invalid payload (string)
            effect: (ref, prevResult) => {
                const placedWhenBid = prevResult?.reactions?.find(
                    (r: any) => r.type === 'bid placed' && r.details?.bidType === 'when' && r.details?.eventId === toggleTodoTrigger.id
                );
                const bidId = placedWhenBid?.details?.bidId;
                assert(typeof bidId === 'number', "Could not find when bid id");
                ref.actionInput = { type: "input", payload: "invalid-id", eventId: toggleTodoTrigger.id, rulePath: [], bidId: bidId, id: null }; 
            },
            // Rule progresses on trigger but should return early and end without placing set bid
            reactions: [
                 { flowPath: [], type: 'rule progressed on a bid', details: { bidType: 'when', eventId: toggleTodoTrigger.id } },
                 { flowPath: [], type: 'rule ended' } // Rule ends because it returns early
            ]
        }
    ], "ToggleTodoRule_InvalidPayload");
}); 