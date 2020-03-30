# Tutorial 1:  Requirements -> Code
In this tutorial, we will write a [TodoMVC](http://todomvc.com/) application.<br/>
The goal of this tutorial is to illustrate how flowcards enables a requirement-centric coding style.<br/>

## Begin With the End in Mind
In the end, it comes down to a simple question: Is the software working as desined / expected?<br/>
Answering this question is only possible if you have defined software requirements.<br/>

### A Friend
As a developer, requirements are your friend.<br/>
They enable you to say things like "I have finished my work" or "can you do this task for me?".<br/>
It is nice to have them around.<br/>
We find requirements on both ends - planning and testing - but what about coding?<br/>
They are nowhere to be found in our code.<br/>
We as Developers look at those requirements and use them to make needed changes<br/> 
to different parts of our software to fullfill them.<br/>
They shape our code, but the requirement itself is nowhere to be found - they have no place.<br/>
Not a great way to treat your friend.<br/>

### Digging
This becomes a problem when you want to make code-changes.<br/>
You find yourself asking questions like "do we need the property x?" or "why is this if/else here?".<br/>
Requirements would help answer those questions, but they are burried, so you start digging.<br/>

### Experiment
What would happen if requirements have a place in our code?
What would this do to software development, if requirements are found in planning, coding and testing?
We can try this out - right now.

## TodoMVC
The TodoMVC team created [a specification](https://github.com/tastejs/todomvc/blob/master/app-spec.md#functionality).<br/>
We will use the provided specification for our tutorial.<br/>
I used this [template](https://github.com/tastejs/todomvc-app-template/) to create a basic react-Application with multiple components and no functionality.<br/>
You do not need to understand react to be able to follow this tutorial.
This is the result - lets get to the fun part.<br/>

### 1. NoTodos
The first requirement is simple: When there are no todos, #main and #footer should be hidden.
This requirement can be translated into this function:
```ts
function* noTodosWillHideHeaderAndFooter(this: ThreadContext, itemCount) {
  if(itemCount === 0) {
    this.hide('main');
    this.hide('footer');
    yield null; // wait
  }
}
```
```function*``` is a [generator function](https://codeburst.io/understanding-generators-in-es6-javascript-with-examples-6728834016d5). Every scenario we want to enable needs to be defined as a generator.<br/>
All you need to know at this point is that a generator will pause its execution when it reaches the yield keyword.
```yield null```means - wait here forever.<br/>
This generator is later used to create something called a BThread.<br/>
BThreads come with some special properties. The first one is:<br/>
```1. when an argument changes, a BThread is reset```. 

Before we create BThreads, lets take a look at the second requirement.

### 2. NewTodo
- the todoInput gets an autofocus property. ( we do this in html )
- pressing Enter creates a todo (appends it to the todo list)
- when the todo is added, the input is cleared.
- an empty input can not be added
```ts
function* newTodoCanBeAdded(todos: Todo[]) {
  while(true) {
    yield wait('inputOnEnter', (val) => val.trim().length > 0);
    yield request
  }
  
}
```


