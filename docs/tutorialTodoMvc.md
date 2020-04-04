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
They are nowhere to be found in our code.<br/>
They shape our code, but the requirement itself is nowhere to be found - they have no place.<br/>
Not a great way to treat your friend.<br/>

### lost the "why"

This becomes an obvious problem when you want to make changes to a bigger codebase.<br/>
You find yourself asking questions like "do we need this part?" or "why is this if/else here? - this is stupid".<br/>
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
Here is the [codesandbox](https://codesandbox.io/s/todomvc-step-2-gbj7o) that will include the code from this step.

### NoTodos

To the first requirement: 
- When there are no todos, Main and Footer should be hidden

We tranlate this requirement to a [generator function](https://codeburst.io/understanding-generators-in-es6-javascript-with-examples-6728834016d5):

```ts
function* noTodosWillHideHeaderAndFooter(this: BTContext, itemCount: number) {
  if (itemCount === 0) {
    this.hide("Main", "Footer");
    yield null;
  }
}
```

Every scenario we want to enable will be defined as a generator.<br/>
All you need to know at this point, is that a generator will pause its execution when it reaches the `yield` keyword.<br/>
`yield null` means: wait here forever.<br/>
This generator is later used to create something called a BThread.<br/>
`this` will be bound to a BThread context (BTContext).<br/>
<br/>
Let's take a look at the second requirement.

### New Todo

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
  let latestId = 0;
  while (true) {
    this.props("TodoInput", ({ inputOnEnter }) => ({ onKeyDown: handleKeyDown(inputOnEnter) }));
    const val = yield wait("inputOnEnter", (val: string) => val.trim().length > 0);
    yield request("s_todos", [...todos.current, { id: latestId++, title: val, isCompleted: false }]);
  }
}
```

The first thing i want to point out are the variables `latestId` and `inputVal`.<br/>
They are local state. Not local to a component, but local to the scenario.<br/>
`this.override` is a function that will accept a component name and an override expression. This idea comes from the uber-team - called [overrides pattern](https://medium.com/@dschnr/better-reusable-react-components-with-the-overrides-pattern-9eca2339f646). In this case, we change 3 properties of the `TodoInput` component.<br/>
`({inputOnEnter, inputOnChange})`are two dispatch functions. When the input calls them, they will trigger the corresponding events `inputOnEnter` and `inputOnChange`.

The `inputOnEnter` wait function has a second argument. A guard function `(val) => val.trim().length > 0`. If this
guard will return false, the inputOnEnter event can not be dispatched.<br/>
This way, you do not need to make input validation checks in your component. The scenario takes care of it.<br/>

The last thing that happens in this generator is a `request` to change the todos.<br/>
There are only 4 functions you can use: `wait`, `request`, `block` and `intercept`.<br/>
Read more about it [here](https://medium.com/@lmatteis/react-behavioral-cf6523747aaf).<br/>

### Create BThreads

BThreads are created by using the `enable` function.<br/>
The first argument is the genartor-function, the second is an array of arguments for the generator-function. The `state` function is nothing more than an event-cache. It will listen for the `s_totos` event and update itself with the new payload.
Feel free to change the function names to `flow, eventCache` if you like.

```ts
useScenarios((enable, state) => {
  const todosRef = state('s_todos', []);
  enable(noTodosWillHideHeaderAndFooter, [todosRef.current.length]);
  enable(newTodoCanBeAdded, [todosRef]);
});
```

### Apply Overrides

The `useOverrides` hook will take the calculated overrides and apply them to selected Components.<br/>

```ts
const { Main, Footer, TodoInput } = useOverrides(Components, overrides);
```

However, you can use flowcards without overrides if you want.<br/>
The `useScenarios` hook will return a `Scenarios` object, that will contain all the information you need to update your UI.<br/>
<br/>
For example: The todoMVC spec is missing a requirement that todo-items are listed in the main-section.<br/>
If you work directly with the requirements, it is very noticeable.<br/>
You can create a new requirement or you get the state from the `useScenarios` hook and render those Items without a BThread.<br/>

```ts
<Main>
  {state.s_todos.map(todo => (
    <TodoItem title={todo.title} />
  ))}
</Main>
```

## Step 2

Here is the [codesandbox](https://codesandbox.io/s/todomvc-step-2-gbj7o) that will include the code from this step.

### TODO

- Zeige die umsetzung des nächsten Scenarios
- Zeige wie man in der Komponente überprüfen kann, ob eine funktionalität vorhanden ist
  -> Dann reicht es einfach Scenarien ein/auszukommentieren.
- Zeige im scaffolden das if (todos.length > 0) ...


## Step 3 - extending behaviours
- block delete and check, as log as there is an item in edit mode.
- props override can be a function
