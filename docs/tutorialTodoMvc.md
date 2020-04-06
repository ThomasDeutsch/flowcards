# Guide: from Requirements to Code

In this guide, we will take a look at a [TodoMVC](https://codesandbox.io/s/todomvc-final-qnfjr) application written with flowcards.<br/>
It is targeted towards JavaScript/TypeScript Developers.<br/>

Goals for this guide
- tell you something about the "why"
- show how requirements can have a place in your code ⭐
- show first flowcards basics
<br/>

## Begin With the End in Mind

In the end, it comes down to a simple question: Is the software working as desined / expected?<br/>
Answering this question is only possible if we agreed on a goal. The requirements we want to fulfill.<br/>

### friend

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

### my desired future

I think that the abandonment of requirements in our code leads to<br/> 
a systemic problem in software development.<br/>
I want to offer a tool, to bring development, planning and testing together.<br/>
To create a common ground, where we share the same language and<br/> 
to make software development a bit more welcoming.<br/>
<br/>

# TodoMVC

The TodoMVC application is a good starting point, because you already know what to expect, and the TodoMVC team provided [a specification](https://github.com/tastejs/todomvc/blob/master/app-spec.md#functionality) we will use for our implementation.<br/>
A main goal of this guide is to demonstrate that we are able to give requirements a place our code.<br/>
For this example we will use the React framework.<br>
React takes a state and turns it into its UI-representation. You can think of it as a function: `ReactApp(state) => UI`.<br/>
flowcards is a tool to define state as a combination of scenarios we want to enable.<br/>
So you we end up with: `ReactApp(flowcards(scenarios)) => UI`.<br/>
This guide is not about React. We will focus on the `flowcards(scenarios)` bit.<br/>

I would encourage you to make small changes to the app and see how they work out.<br/>

### from Specification to Behaviour
In the provided specification, we can find functional requirements. We take those requirements to define "scenarios" or "flows". Every scenario will enable a behaviour.<br/>

### A first look

Open the todoMVC application and go to line 100.<br/>
In the App root component, you can find the `useScenarios` function.<br/>
The behaviours we want to enable are listed here.<br/>
You can disable a behaviour by uncommenting it.<br/>

```ts
  const sc = useScenarios((enable, state) => {
    const todosRef = state("s_todos", []);
    enable(newTodoCanBeAdded, [todosRef]);
    if (todosRef.current.length > 0) {
      enable(toggleCompleteForAllTodos, [todosRef]);
      enable(itemCanBeCompleted, [todosRef]);
      enable(itemCanBeDeleted, [todosRef]);
      enable(itemCanBeEdited, [todosRef]);
      if (someCompleted(todosRef.current)) {
        enable(completedItemsCanBeCleared, [todosRef]);
      }
    }
  });
```

As you can see, some behaviours are only enabled if we have some todos.<br/>
Not only for performance reasons, but also to show dependencies between them.<br/>
For example: You don't want to enable a "count goals" behaviour, if the soccer game hasn't even started.<br/>
There are two functions that can be used.<br/>
The `state` function is nothing more than an event-cache. It will listen for the `s_totos` event and update itself with the new payload.<br/>
The other is the `enable` function.<br/>

### from generators to BThreads

The enable function can take 3 arguments. The first is a generator function.<br/>
The generator function for the first behavior is this:
```ts
function* newTodoCanBeAdded(todos: StateRef<Todo[]>) {
  while (true) {
    const title = yield wait("inputOnEnter", (title: string) => title.trim().length > 0);
    yield request("s_todos", [...todos.current, newTodo(title)]);
  }
}
```

`enable` will use the generator function to create something called a BThread.<br/>
A Bthread is a wrapper around the generator and enables us to use a very simple api for BThread-to-BThread communication.<br/>
At every `yield` a BThread can place a bid (or multiple bids). There are 4 types of bids:
- request  (requesting an event and only continue if the request has been granted)
- wait (waiting for an event)
- block (blocking an event, no request or wait can continue for this event)
- intercept (continue this BThread only - instead of other BThreads waiting for this event)

request, wait and block are based on [Behavioral Programming Principles](http://www.wisdom.weizmann.ac.il/~bprogram/more.html)

You can get information about the current state of a BThread, by looking at its return value.<br/>
For example, you can `console.log(enable(itemCanBeDeleted, [todosRef]))`.


Arguments can be seen as BThread context. If they change, the BThreads get reset.<br/>
So, if the length of the todos change, the `noTodosWillHideHeaderAndFooter` BThread will be created again.<br/>
The `newTodoCanBeAdded` will never reset. It receives an object that is always the same.<br/>
The check is done by an [Object.is](https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Global_Objects/Object/is) for every argument.<br/>
If you want to make it reset on todo-changes, you can pass the argument `todosRef.current`.<br/>
