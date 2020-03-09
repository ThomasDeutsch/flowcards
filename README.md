# flowcards

using scenarios to enable modular behavior. Based on [behavioral programming principles](http://www.wisdom.weizmann.ac.il/~bprogram/more.html#Event%20selection%20with%20%20a%20global%20view)

You can compare flowcards to [XState](https://github.com/davidkpiano/xstate).<br/>
They both enable ways to describe & model reactive systems.<br/>
Use them for well defined state-transitions, and free yourself from switch-case reducers.<br/>

## Comparison

finite-state machines and statecharts (XState), provide a way<br/>
for specifying the behavior of the system per object / component.<br/>
For example, take a look at a [traffic-light machine](https://github.com/davidkpiano/xstate#finite-state-machines).<br>
Behavior is described in an intra-object (within object) fashion.

flowcards enable behavior descriptions as inter-object flows.<br/>
You know this from UX [user-flows](https://miro.medium.com/max/1548/1*JGL_2ffE9foLaDbjp5g92g.png): A series of steps a user needs to take, to reach a meaningful goal.<br/>
In this case, a system is not defined by the reactivity of each component,<br/>
but by scenarios / flows that are enabled.<br/>

## Packages

- [🌀 `@flowcards/core`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/core) - core library (typed, tested & dependency-free)
- [⚛️ `@flowcards/react`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/react) - React hooks (core included)

## Quick Start

```
npm install @flowcards/core
```

```javascript
import { scenarios, request, wait } from @flowcards/core;

const delayed = (data, ms) => new Promise(r => setTimeout(() => r(data), ms));

// JS Generators define your scenarios
function* sender() {
    yield request('event1', 'well done!'); // request an event
    yield request('event2', delayed('you are making progress', 2000)); // async request
}

function* receiver() {
    let message = yield wait('event1'); // wait for event
    console.log(message);
    message = yield wait('event2'); // wait for async event
    console.log(message);
}

scenarios(enable => {
    enable(sender);
    enable(receiver);
});
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
