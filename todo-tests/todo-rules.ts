import { Event, Rule, RuleGenerator, when, set, given } from "../core/index.ts";

// --- Interfaces ---
export interface Todo {
    id: number;
    text: string;
    completed: boolean;
}

// --- Events ---

// Holds the current array of To-Do items
export const todosEvent = new Event<Todo[]>('todos');
todosEvent.setDescription("Holds the current list of all To-Do items");

// Triggered to add a new task, payload is the task text
export const addTodoTrigger = new Event<string>('addTodoTrigger');
addTodoTrigger.setDescription("Triggered to add a new task to the list. Payload is the task text.");

// Triggered to toggle a task's completion, payload is the task ID
export const toggleTodoTrigger = new Event<number>('toggleTodoTrigger');
toggleTodoTrigger.setDescription("Triggered to toggle the completion status of a specific To-Do item. Payload is the ID of the item to toggle.");

// --- Rules ---

/**
 * user is able to add a todo to the list
 */
export const addTodoRule = function*(this: Rule): RuleGenerator {
    while (true) {
        // Wait for the add trigger
        const [triggerEvent] = yield when(addTodoTrigger);
        const newTodoText = (triggerEvent as Event<string>).value;

        if (!newTodoText || typeof newTodoText !== 'string' || newTodoText.trim() === '') {
            console.warn('[addTodoRule] Ignoring empty add request.');
            continue; // Skip this iteration if text is invalid
        }

        // Place a request to update the todos list
        // The payload function reads the *current* list when the request is processed
        yield set(todosEvent, (currentTodos = []) => [
            ...currentTodos,
            { 
                id: Date.now(), // Simple ID generation for example
                text: newTodoText.trim(), 
                completed: false 
            }
        ]);
        // Loop continues, waiting for the next trigger
    }
};

/**
 * Rule: Toggles the completed status of a todo item when triggered.
 */
export const toggleTodoRule = function*(this: Rule): RuleGenerator {
    while (true) {
        // Wait for the toggle trigger
        const [triggerEvent] = yield when(toggleTodoTrigger);
        const todoIdToToggle = (triggerEvent as Event<number>).value;

        if (typeof todoIdToToggle !== 'number') {
            console.warn('[toggleTodoRule] Ignoring invalid toggle request (ID not a number).');
            continue; // Skip this iteration if ID is invalid
        }

        // Place a request to update the todos list
        // The payload function reads the *current* list when the request is processed
        yield set(todosEvent, (currentTodos = []) => 
            currentTodos.map(todo => 
                todo.id === todoIdToToggle 
                    ? { ...todo, completed: !todo.completed } 
                    : todo
            )
        );
        // Loop continues, waiting for the next trigger
    }
}; 