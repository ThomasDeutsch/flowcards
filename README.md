# flowcards

a tool to describe behaviour - flow by flow.

You can compare flowcards to [XState](https://github.com/davidkpiano/xstate).<br/>
They both enable ways to describe & model reactive systems.<br/>
Use them for well defined state-transitions, and free yourself from switch-case reducers.<br/>

## Comparison

finite-state machines and statecharts (XState), provide a way<br/>
for specifying the behavior of the system per object / component.<br/>
For example, take a look at a [traffic-light machine](https://github.com/davidkpiano/xstate#finite-state-machines).<br>
Behavior is described in an intra-object (within object) fashion.

flowcards is a bit different.<br/>
You may know [user-flows](https://miro.medium.com/max/1548/1*JGL_2ffE9foLaDbjp5g92g.png): A series of steps a user needs to take, to reach a goal.<br/>
A user-flow is not bound to a single component. It describes behaviour as an inter-object flow.<br/> 
This idea is used by flowcards. Instead of describing behaviour object by object, we describe it flow by flow.<br/>
By enabling modular flows (scenarios) we can describe software-requirements as a central elements in our code.
This small tutorial demonstrates this fact.
flowcards is based on [behavioral programming principles](http://www.wisdom.weizmann.ac.il/~bprogram/more.html).


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
