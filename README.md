![flowcards](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/banner-flowcards-2.png)

Scenario-Based Programming (SBP) for JavaScript & TypeScript 

## Use It For
flowcards is a replacement for traditional state-management solutions like redux.<br/>
```App(state) => UI``` becomes ```App(flowcards(scenarios)) => UI```<br/>
Use flowcards for well defined state transitions, based on scenarios you want to enable.<br/>

## Why
flowcards primary goal, is to enable teams to build better software.<br/>
One way, would be to provide a tool for developers and hope for the benefits to "trickle-down".<br/>
Another aproach is to use a tool that can bring different disciplines together.<br/>
flowcards enables developers to write code, that is aligned to the work done by UX, RE and Testing.<br/>
Opening up new possibilites to create effective teams.<br/>

## How
flowcards gives JavaScript developers the option to use the power of Scenario-Based Programming.<br/>
Instead of describing a reactive system object-by-object, the developer is now able to write modular<br/>
scenarios, flow-by-flow. The power lies in the interconnection of different disciplines - for example: DEV and UX<br/>

## Example
To demonstrate the scenario approach, we take a look at user-flows.<br/>
A user flow is a series of steps a user takes to achieve a meaningful goal.<br/>
Lets say, we want to build an e-commerce app, we might start with this flow:<br/>
<br/>
![flow-1](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/purchase-flow-1.png)

this can be translated to a JavaScript generator function
```js
function* userIsAbleToPurchaseProduct() {
  yield wait('selectProduct');
  yield wait('toPurchase');
  yield wait('confirmAndPurchase');
  yield wait('toProductList');
}
```
This a 1-to-1 translation: from a scenario as a user-flow to a scenario in code.<br/>
We can use this as a common-ground, to talk about the software we want to build.<br/>
A developer might give the feedback, that the 'confirmAndPurchase' event is an async event<br/>
and that the UX-Team needs to think about some kind of loading-spinner after the button is clicked.<br/>
Even after weeks and months into the project, a developer can always refer to this scenario as the source of truth.<br/>

## Getting Started
todo: LINK

## Packages

- [🌀 `@flowcards/core (documentation)`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/core) - core library (typed, tested & dependency-free)
- [![-](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/icon-react.png) `@flowcards/react`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/react) - React hook
- [![-](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/icon-svelte.png) `@flowcards/svelte`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/svelte) - Svelte store
- [![-](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/icon-mobx.png) `@flowcards/mobx`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/mobx) - MobX store
- [![-](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/icon-rxjs.png) `@flowcards/rxjs`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/rxjs) - Observable from BehaviorSubject
<br/>


## Quick Start 
- [`core codesandbox`](https://codesandbox.io/s/hello-flowcards-dk9yl?file=/src/index.ts)
- [`react codesandbox (TodoMVC App + EventTool)`](https://codesandbox.io/s/flowcardsreact-playground-knebp)
- [`svelte codesandbox`](https://codesandbox.io/s/flowcards-hello-svelte-sscxp?file=/App.svelte)
```
npm install @flowcards/core
```

```ts
import { scenarios, request, wait } from "@flowcards/core";

const delayed = (data: any, ms: number) => new Promise(r => setTimeout(() => r(data), ms));
const delayedMessage = () => delayed("taking a look at flowcards", 3000);

function* sender() {
  yield request("eventOne", "thank you for ..."); // request
  yield [request("eventTwo", delayedMessage), wait("cancel")];
}

function* receiver() {
  let messageOne = yield wait("eventOne"); // wait for event
  console.log(messageOne);
  let [type, messageTwo] = yield [wait("eventTwo"), wait("cancel")];
  if (type === "eventTwo") {
    console.log(messageTwo);
  } else {
    console.log("async call has been cancelled");
  }
}

scenarios(
  enable => {
    enable(sender);
    enable(receiver);
  },
  ({ dispatch }) => {
    const btn = <HTMLInputElement>document.getElementById("cancelBtn");
    if(!btn) return;
    if (dispatch.cancel) {
      btn.onclick = dispatch.cancel();
    } else {
      btn.disabled = true;
    }
  }
);
```


