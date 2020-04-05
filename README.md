# flowcards

a tool to describe behaviour - flow by flow.

You can compare flowcards to [XState](https://github.com/davidkpiano/xstate).<br/>
They both enable ways to describe & model reactive systems.<br/>
Use them for well defined state-transitions, and free yourself from switch-case reducers.<br/>

You may know [user-flows](https://miro.medium.com/max/1548/1*JGL_2ffE9foLaDbjp5g92g.png): A series of steps a user needs to take, to reach a goal.<br/>
A user-flow is an intra-object description of a reactive system.<br/>
Instead of describing the full reactivity of each component object-by-object (like XState),<br/>
we define a system by the scenarios we want to enable flow-by-flow.<br/>
This creates new possibilities in how we work with requirements - and with each other.<br/>

👉 [this tutorial](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/tutorialTodoMvc.md) will introduce you to the idea.<br/>

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
import { scenarios, request, wait } from "@flowcards/core";

const delayed = (data: any, ms: number) => new Promise(r => setTimeout(() => r(data), ms));

function* sender() {
  yield request("eventOne", "thank you for ..."); // request
  yield request("eventTwo", () => delayed("taking a look at flowcards", 3000)); // async request
}

function* receiver() {
  let messageOne = yield wait("eventOne"); // wait for event
  console.log(messageOne);
  let [type, messageTwo] = yield [wait("eventTwo"), wait("cancel")]; // cancelable
  if (type === "eventTwo") {
    console.log(messageTwo);
  } else {
    console.log("async call has been canceled");
  }
}

scenarios(
  enable => {
    enable(sender);
    enable(receiver);
  },
  ({ dispatch }) => {
    const btn = document.getElementById("cancelBtn");
    if (btn && dispatch.cancel) {
      btn.onclick = dispatch.cancel();
    }
  }
);
```


