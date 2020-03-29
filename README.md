# flowcards

a tool to describe behaviour - flow by flow.

You can compare flowcards to [XState](https://github.com/davidkpiano/xstate).<br/>
They both enable ways to describe & model reactive systems.<br/>
Use them for well defined state-transitions, and free yourself from switch-case reducers.<br/>

Instead of describing reactivty object-by-object (like xState), we can describe it differently.<br/>
You may know [user-flows](https://miro.medium.com/max/1548/1*JGL_2ffE9foLaDbjp5g92g.png): A series of steps a user needs to take, to reach a goal.<br/>
A user-flow is an intra-object description of a reactive system.<br/>
Instead of describing the full reactivity of each component (object-by-object), we define a reactive system flow-by-flow.<br/>
This idea is used by flowcards.<br/>

By using a flow-by-flow approach, we create new possibilites to describe behaviour in a modular fashion.<br/>
You are able to organize your code not only on a compoent-level, but also by requirement/scenario.
[This tutorial](https://github.com) will demonstrate this fact.<br/>
<br/>
flowcards is based on [behavioral programming principles](http://www.wisdom.weizmann.ac.il/~bprogram/more.html).
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
  yield request("greetingOne", "thank you for ..."); // request
  yield request("greetingTwo", delayed("taking a look at flowcards", 2000)); // async request
}

function* receiver(this: ThreadContext) {
  let msg = yield wait("greetingOne"); // wait for event
  this.show("messagebox", () => `message: ${msg}`);
  msg = yield wait("greetingTwo"); // wait for async event
  this.show("messagebox", () => `message: "${msg}"`);
}

scenarios(
  enable => {
    enable(sender);
    enable(receiver);
  },
  s => {
    for (let id in s.overrides) {
      document.getElementById(id).innerHTML = s.overrides[id].overrides[0];
    }
  }
);
```


