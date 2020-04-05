# Tutorial 1: from Requirements to Code

In this tutorial, we will write a [TodoMVC](http://todomvc.com/) application. [` final result `](https://codesandbox.io/s/todomvc-final-xbll0)<br/>
It is targeted towards JavaScript/TypeScript Developers.<br/>
<br/>
Goals of this tutorial: 
- to tell you about the "why"
- show how requirements can have a place in our code ⭐
- show first flowcards basics
<br/>

## Begin With the End in Mind

In the end, it comes down to a simple question: Is the software working as desined / expected?<br/>
Answering this question is only possible if we agreed on a goal. The requirements we want to fulfill.<br/>

### Friend

As a developer, requirements are your friend.<br/>
They enable you to say things like "I have finished my work" or "can you do this task for me?".<br/>
It is nice to have them around, particularly in a professional setting.<br/>
We find requirements on both ends - planning and testing - but what about coding?<br/>
They shape our code, but the requirement itself is nowhere to be found - they have no place.<br/>
Not a great way to treat your friend.<br/>

### lost the "why"

This becomes an obvious problem when you want to make changes to a bigger codebase.<br/>
You find yourself asking questions like "do we need this part?" or "why is this if/else here?<br/>
Requirements would help you to understand. They are the reason WHY someone wrote that code.<br/>
But they are burried - so you start digging.<br/>

### my Desired Future

I think that the abandonment of requirements in our code leads to<br/> 
a systemic problem in software development.<br/>
I want to offer a tool, to bring development, planning and testing together.<br/>
To create a common ground, where we share the same language and<br/> 
to make software development a bit more welcoming.<br/>
<br/>

# TodoMVC

The TodoMVC application is a good starting point, because you already know what to expect, and the TodoMVC team provided [a specification](https://github.com/tastejs/todomvc/blob/master/app-spec.md#functionality) we will use for our implementation.<br/>
A main goal of this tutorial is to show how we can use the provided specification in our code.<br/>
I used a template to create a [basic React application](https://codesandbox.io/s/todomvc-step-1-44z8u).<br>
How does flowcards fit into the React framework?<br/>
React will take a state and turn it into its UI-representation. You can think of it as a function: `ReactApp(state) => UI`.<br/>
flowcards is a tool to define state as a combination of scenarios we want to enable.<br/>
So you we end up with: `ReactApp(flowcards(scenarios)) => UI`.<br/>
This tutorial is not about React. We will focus on the `flowcards(scenarios)` bit.<br/>

When you follow the tutorial, there is no need to type everything in by yourself.<br/> 
For every step, there is a codesanbox you can use.<br/>
I would encourage you to make small changes and see how they work out.<br/>

## Step 1

In the provided specification, we can find functional requirements. We take those requirements to define "scenarios" or "flows". Every scenario will enable a behaviour.<br/>
Here is the [codesandbox](https://codesandbox.io/s/todomvc-step-2-pt4ie) that includes the code from this step.

### no todos

To the first requirement: 
- When there are no todos, Main and Footer should be hidden

We tranlate this requirement to a [generator function](https://codeburst.io/understanding-generators-in-es6-javascript-with-examples-6728834016d5):

```ts
function* noTodosWillHideMainAndFooter(this: BTContext, itemCount: number) {
  if (itemCount === 0) {
    this.hide("Main", "Footer");
    yield null;
  }
}
```

Every scenario we want to enable will be defined as a generator.<br/>
A generator will pause its execution when it reaches the `yield` keyword.<br/>
`yield null` means: wait here forever.<br/>
This generator is later used to create something called a BThread.<br/>
`this` will be bound to a BThread context (BTContext).<br/>
<br/>
Let's take a look at the second requirement.

### new todo

In this requirement we will find a bit more functionality.<br>

- the todoInput gets an autofocus property. ( we do this in html )
- pressing Enter creates a todo (appends it to the todo list)
- an empty input can not be added
- when the todo is added, the input is cleared.

```ts
const handleKeyDown = (onEnter: GuardedDispatch) => (e: any) => {
  if (e.key === "Enter") {
    const dispatch = onEnter(e.target.value);
    if (dispatch) {
      e.target.value = "";
      dispatch();
    }
  }
};
function* newTodoCanBeAdded(this: BTContext, todos: StateRef<Todo[]>) {
  while (true) {
    this.props("TodoInput", ({ inputOnEnter }) => ({ onKeyDown: handleKeyDown(inputOnEnter) }));
    const val = yield wait("inputOnEnter", (val: string) => val.trim().length > 0);
    yield request("s_todos", [...todos.current, { id: utils.uuid(), title: val, isCompleted: false }]);
  }
}
```
For this requirement, we will define an eventhandler and a gernerator function.<br/>
The eventhandler gets a `GuardedDispatch` function. This guard is defined in the generator function:  `(val: string) => val.trim().length > 0`.<br/>
If the guard-function returns true, the `onEnter(e.target.value)` will return a `dispatch` function - null otherwise.<br/>
This way, you can only dispatch valid payloads. No need to make input validation checks in your component.<br/>
When we look at the generator, we can see that the onKeyDown gets passed to the TodoInput component by using an override expression:<br/>
`this.props("TodoInput", ({ inputOnEnter }) => ({ onKeyDown: handleKeyDown(inputOnEnter) }));`
This is the [overrides pattern](https://medium.com/@dschnr/better-reusable-react-components-with-the-overrides-pattern-9eca2339f646) in action. `this.hide` from the first generator is also an override.<br>
<br/>
The last thing that happens in this generator is a `request` to change the todos.<br/>
`yield request("s_todos", ...)` can be translated to:  This BThrad makes a request to change the todos state.<br/>
If the request is fullfilled, the generator-function will continue.<br/>
There are only 3 basic functions the generator can use `wait`, `request` and `block`.<br/>
They define an interface for BThrad to BThread communication.<br/>
Read more about it [here](https://medium.com/@lmatteis/react-behavioral-cf6523747aaf).<br/>

### from generators to BThreads

BThreads are created by using the `enable` function.<br/>
It will receive the generator-fn and an array of arguments passed to that generator-fn. <br/>
```ts
const { overrides, state } = useScenarios((enable, state) => {
  const todosRef = state("s_todos", []);
  enable(noTodosWillHideHeaderAndFooter, [todosRef.current.length]);
  enable(newTodoCanBeAdded, [todosRef]);
});
```
The `state` function is nothing more than an event-cache. It will listen for the `s_totos` event and update itself with the new payload.<br/>
Arguments can be seen as BThread context. If they change, the BThreads get reset.<br/>
So, if the length of the todos change, the `noTodosWillHideHeaderAndFooter` BThread will be created again.<br/>
The `newTodoCanBeAdded` will never reset. It receives an object that is always the same.<br/>
The check is done by an [Object.is](https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Global_Objects/Object/is) for every argument.<br/>
If you want to make it reset on todo-changes, you can pass the argument `todosRef.current`.<br/>


### using Overrides

There is a second hook that comes with @flowcards/react. The `useOverrides` hook will take the calculated overrides, and create a wrapper component that makes the passed in component overridable.<br/>

```ts
const { Main, Footer, TodoInput } = useOverrides(Components, overrides);
```
You can use flowcards without overrides if you want.<br/>
The `useScenarios` hook returns a `Scenarios` object, that will contain all the information you need to update your UI.<br/>
<br/>
So far, we have implemented two requirements.<br/>
You can disable the new behaviours simply by un-commenting them from the useScenarios function.<br/>
For reusable components, this is an amazing thing to have.<br/>
It is no longer about modular components. We are now talking about modular behaviour.<br/>

## Step 2

In this part, we will continue to implement behaviours, based on the requirements from the TodoMVC specification.<br/>
Here is the [codesandbox](https://codesandbox.io/s/todomvc-step-2-pt4ie) that includes the code from this step.<br/>

### mark all as complete

The "Mark all as complete" checkbox should: 
- toggle all todos.
- reflect the current state (checked, when all TodoItems are checked)

```ts
const areAllCompleted = (todos: Todo[]) => todos.every((t: Todo) => t.isCompleted === true);
const setAllCompleted = (todos: Todo[], val: boolean) => todos.map((t: Todo) => ({ ...t, isCompleted: val }));

function* toggleCompleteForAllTodos(this: BTContext, todos: StateRef<Todo[]>) {
  while (true) {
    this.props("Main", ({ toggleAll }) => ({ toggleAll: toggleAll }));
    const toggleTo = yield wait("toggleAll", (next: boolean) => (areAllCompleted(todos.current) ? !next : next));
    yield request("s_todos", setAllCompleted(todos.current, toggleTo));
  }
}
```

When you take a look at the `Main` component, you can see how we use the toggleAll event handler.<br/>
It is a good practice to assume that toggleAll could be absent.<br/>
If at some point a new behaviour is introduced, for example that you can only toggle less then 10 todos,<br>
then props.toggleAll might be undefined. It also lets you think about possible UI-states in your component.<br/>
If you plan to create reusable components, this is a must.<br/>
```ts
  const setCompleteAll = props.toggleAll && props.toggleAll(true);
  const setUnCompleteAll = props.toggleAll && props.toggleAll(false);
```

You can use "optional chaining" ( since [Typescript 3.7](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html), [babel 7](https://babeljs.io/docs/en/next/babel-plugin-proposal-optional-chaining.html), or check [native](https://caniuse.com/#feat=mdn-javascript_operators_optional_chaining) support ) for this.
```ts
  const setCompleteAll = props.toggleAll?.(true);
  const setUnCompleteAll = props.toggleAll?.(false);
```

### complete & delete todos
- Clicking the checkbox marks the todo as complete 
```ts
function* itemCanBeCompleted(this: BTContext, todos: StateRef<Todo[]>) {
  while (true) {
    this.props("TodoItem", ({ toggleCompleteItem }) => ({ onComplete: toggleCompleteItem }));
    let toggledTodoId = yield wait("toggleCompleteItem");
    let newTodos = todos.current.map((todo: Todo) =>
      toggledTodoId === todo.id ? { ...todo, isCompleted: !todo.isCompleted } : todo
    );
    yield request("s_todos", newTodos);
  }
}
```
- Hovering over the todo shows the remove button ( clicking it will remove the item )
```ts
function* itemCanBeDeleted(this: BTContext, todos: StateRef<Todo[]>) {
  while (true) {
    this.props("TodoItem", ({ deleteTodoItem }) => ({ onDelete: deleteTodoItem }));
    let todoId = yield wait("deleteTodoItem");
    let newTodos = todos.current.filter((todo: Todo) => todoId !== todo.id);
    yield request("s_todos", newTodos);
  }
}
```
<br/>

The new behaviours get enabled in the `useScenarios` function.
```ts 
useScenarios((enable, state) => {
  const todosRef = state("s_todos", []);
  enable(noTodosWillHideHeaderAndFooter, [todosRef.current.length]);
  enable(newTodoCanBeAdded, [todosRef]);
  if (todosRef.current.length > 0) {
    enable(toggleCompleteForAllTodos, [todosRef]);
    enable(itemCanBeCompleted, [todosRef]);
    enable(itemCanBeDeleted, [todosRef]);
  }
});
```
As you can see, the new behaviours are only enabled if we have some todos.<br/>
Not only for performance reasons, but also to show dependencies between BThreads / states.<br/>
You don't want to enable a "count goals" behaviour, if the soccer game hasn't even started.<br/>



## Final Step
This is the final result: [codesandbox](https://codesandbox.io/s/todomvc-final-xbll0).<br/>
I have implemented 
  - clear all completed
  - filter (without routing)
  - local storage

