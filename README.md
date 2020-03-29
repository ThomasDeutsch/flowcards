# flowcards

using scenarios and enable modular behavior.

You can compare flowcards to [XState](https://github.com/davidkpiano/xstate).<br/>
They both enable ways to describe & model reactive systems.<br/>
Use them for well defined state-transitions, and free yourself from switch-case reducers.<br/>

## Comparison

finite-state machines and statecharts (XState), provide a way<br/>
for specifying the behavior of the system per object / component.<br/>
For example, take a look at a [traffic-light machine](https://github.com/davidkpiano/xstate#finite-state-machines).<br>
Behavior is described in an intra-object (within object) fashion.

On the other hand, flowcards enable behavior descriptions as inter-object flows.<br/>
You know this from UX [user-flows](https://miro.medium.com/max/1548/1*JGL_2ffE9foLaDbjp5g92g.png): A series of steps a user needs to take, to reach a goal.<br/>
In this case, a system is not defined by the reactivity of each component / object,<br/>
but by the sum of all scenarios / flows that are enabled.<br/>
flowcards is based on [behavioral programming principles](http://www.wisdom.weizmann.ac.il/~bprogram/more.html).

## Packages

- [🌀 `@flowcards/core`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/core) - core library (typed, tested & dependency-free)
- [⚛️ `@flowcards/react`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/react) - React hooks (core included)

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

## Why?

Traditionally, we make changes to parts of our system, so that a requirement is fulfilled.<br/>
For Example: We made changes to 3 components and a user now gets a message after he logged out.<br/>
5 month into your project, you look at one of those components and you are not able to tell<br/>
why there is so much code - simply because you do not know about all the scenarios<br/>
you have enabled that touch this component.<br/>
This will make it very difficult to change your code, even with tests.<br/>

flowcards will enable you to keep requirements as modular behaviors in your code.<br/>
This changes perspectives, because you are not complecting scenario-parts into your components.<br/>
What the software does, can be found right at the very top of your application.<br/>
