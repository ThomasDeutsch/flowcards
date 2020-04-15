# Guide: from Requirements to Code

In this guide, we will take a look at a [TodoMVC](https://codesandbox.io/s/todomvc-final-qnfjr?file=/src/App.tsx) application written with flowcards & React.<br/>
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

### lost the "why"

This becomes an obvious problem when you want to make changes to a bigger codebase.<br/>
You find yourself asking questions like "do we need this part?" or "why is this if/else here?<br/>
Requirements would help you to understand. They are the reason WHY someone wrote that code.<br/>
But they are burried - so you start digging.<br/>

### my desired future

I think that the abandonment of requirements in our code leads to<br/> 
a systemic problem in software development.<br/>
I want to offer a tool to resolve this problem.<br/>
To bring development, planning and testing together.<br/>
So that we share the same language and<br/> 
make software development a bit more welcoming.<br/>
<br/>

# TodoMVC

The TodoMVC application is a good starting point, because you already know what to expect, and the TodoMVC team provided [a specification](https://github.com/tastejs/todomvc/blob/master/app-spec.md#functionality) we will use for our implementation.<br/>
A main goal of this guide is to demonstrate that we are able to give requirements a place in our code.<br/>

For this example we will use the React framework.<br>
React takes a state and turns it into a UI-representation. You can think of it as a function: `ReactApp(state) => UI`.<br/>
flowcards is a tool to define state as a combination of scenarios we want to enable.<br/>
So you we end up with: `ReactApp(flowcards(scenarios)) => UI`.<br/>
This guide is not about React. We will focus on the `flowcards(scenarios)` bit.<br/>

I would encourage you to make small changes to the app and see how they work out.<br/>

### from Specification to Behaviour
In the provided specification, we can find functional requirements. We take those requirements to define "scenarios" or "flows". Every scenario will enable a behaviour.<br/>
Looking at our code, we can see that every scenario has a direct connection to one of the requirements.<br/>
It's no longer about modular components only. We are talking about modular behaviour.<br/>

### A first look

Open the [TodoMVC](https://codesandbox.io/s/todomvc-final-qnfjr) application and go to line 100.<br/>
In the App root component, you can find the `useScenarios` function.<br/>
The behaviours we want to enable are listed here.<br/>
You can disable a behaviours by uncommenting them.<br/>
For example, disable the "toggleCompleteAllTodos" behaviour and see what happens.<br/>

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
Some behaviours are only enabled if we have some todos in our list.<br/>
Not only for performance reasons, but also to show dependencies.<br/>
For example: You don't want to enable a "count goals" behaviour, if the soccer game hasn't even started.<br/>

### from generators to BThreads
There are two functions that can be used.<br/>
The `state` function: This is nothing more than an event-cache.<br/>
It will listen for the `s_totos` event and update itself with the new payload.<br/>
And the `enable` function.<br/>

The enable function can take 3 arguments. The first is a generator function.<br/>
Let's take a look at the first generator function `newTodoCanBeAdded`:
```ts
function* newTodoCanBeAdded(todos: StateRef<Todo[]>) {
  while (true) {
    const title = yield wait("inputOnEnter", (title: string) => title.trim().length > 0);
    yield request("s_todos", [...todos.current, newTodo(title)]);
  }
}
```
If you want to learn more about generators - [here is a good introduction](https://medium.com/dailyjs/a-simple-guide-to-understanding-javascript-es6-generators-d1c350551950). But all you need to know at this point, its that a generator will pause at every `yied`.<br/>

`enable` will use the generator function to create something called a BThread.<br/>
It creates a wrapper around the generator and enables a very simple api for BThread-to-BThread communication:<br/>
At every `yield` a BThread can place a bid (or multiple bids). There are 4 types of bids:
- request  (requesting an event and only continue if the request has been granted)
- wait (waiting for an event)
- block (blocking an event, no request or wait can continue for this event)
- intercept (continue this BThread only - instead of other BThreads waiting for this event)

This api is based on [Behavioral Programming Principles](http://www.wisdom.weizmann.ac.il/~bprogram/more.html).<br/>

The `newTodoCanBeAdded` generator shows that the BThread will place two bids.<br/>
1. `yield wait("inputOnEnter", (title: string) => title.trim().length > 0);`<br/>
   = wait for the inputOnEnter event. Only accept this event if the payload length is > 0.
2. `yield request("s_todos", [...todos.current, newTodo(title)]);`<br/>
   = request to set the new s_todos state.

