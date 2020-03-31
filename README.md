# flowcards

a tool to describe behaviour - flow by flow.

You can compare flowcards to [XState](https://github.com/davidkpiano/xstate).<br/>
They both enable ways to describe & model reactive systems.<br/>
Use them for well defined state-transitions, and free yourself from switch-case reducers.<br/>

You may know [user-flows](https://miro.medium.com/max/1548/1*JGL_2ffE9foLaDbjp5g92g.png): A series of steps a user needs to take, to reach a goal.<br/>
A user-flow is an intra-object description of a reactive system.<br/>
Instead of describing the full reactivity of each component object-by-object (like XState),<br/>
we can define a reactive system by the scenarios we want to enable (flow-by-flow).<br/>
This is what flowcards is all about.<br/>

With flowcards, you can organize code by requirement/scenario.<br/>
👉 [this tutorial](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/tutorialTodoMvc.md) will get you started.<br/>

flowcards is based on [behavioral programming principles](http://www.wisdom.weizmann.ac.il/~bprogram/more.html).<br/>
Luca Matteis wrote about it [here](https://medium.com/@lmatteis/b-threads-programming-in-a-way-that-allows-for-easier-changes-5d95b9fb6928). I can also recommend [this talk](https://www.youtube.com/watch?v=_BLQIE-_prc).
<br/>
<br/>

## Packages

- [🌀 `@flowcards/core`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/core) - core library (typed, tested & dependency-free)
- [⚛️ `@flowcards/react`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/react) - React hooks (core included)
<br/>

## Quick Start [` -> codesandbox`](https://codesandbox.io/s/hello-flowcards-dk9yl)

```
npm install @flowcards/core
```

```ts
import { scenarios, request, wait, ThreadContext } from "@flowcards/core";

const delayed = (data: any, ms: number) => new Promise(r => setTimeout(() => r(data), ms));

function* sender() {
  yield request("eventOne", "thank you for ..."); // request
  yield request("eventTwo", delayed("taking a look at flowcards", 2000)); // async request
}

function* receiver() {
  let msg = yield wait("eventOne"); // wait for event
  console.log(msg);
  msg = yield wait("eventTwo"); // wait for async event
  console.log(msg)
}

scenarios(enable => {
  enable(sender);
  enable(receiver);
});
```


