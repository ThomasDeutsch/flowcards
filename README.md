![flowcards](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/banner-flowcards-2.png)

Scenario-Based Programming (SBP) for JavaScript / TypeScript applications

## Use It For
flowcards is a replacement for traditional state-management solutions.<br/>
```App(state) => UI``` becomes ```App(flowcards(scenarios)) => UI```<br/>
Use flowcards for well defined state transitions, based on scenarios you want to enable.<br/>

## Why
flowcards primary goal, is to enable teams to build better software.<br/>
It is more than providing a new tool for developers and hope for the benefits to "trickle-down".<br/>
flowcards enables developers to write code, that is aligned to the work done by UX, RE and Testing.<br/>
Opening up new possibilites for effective teams.<br/>

## How
flowcards gives JavaScript developers the option to use Scenario-Based Programming.<br/>
Instead of describing a reactive system object-by-object, the developer is now able to write modular<br/>
scenarios, flow-by-flow. The power lies in the interconnection of different disciplines - for example: DEV and UX<br/>

## Example
To demonstrate the scenario approach, we take a look at user-flows.<br/>
A user flow is a series of steps a user takes to achieve a meaningful goal.<br/>
If we want to build an e-commerce app, we might start with:<br/>
<br/>
![flow-1](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/purchase-flow-1.png)

this can be translated to a JavaScript generator function
```js
function* userCanPurchaseSelectedProduct() {
  const productId = yield wait('selectProduct');
  yield request('nextPage', `/product-details/${productId}`);
  const paymentDetails = yield wait('confirmPaymentDetails');
  yield request('nextPage', `/payment-details`);
  yield wait('confirmAndPurchase');
  yield request('apiCall', () => apiPurchase(productId, paymentDetails))
  yield request('nextPage', `/purchase-confirmation`);
}
```
This a direct translation: From a scenario as a user-flow to a scenario in code.<br/>
flowcards provides a modular system for your scenarios, so that developers are able to model<br/>
frontend applications flow-by-flow. It is no longer about modular components, now we can create
modular behaviour.<br/>

## Benefits
The code-structure can be based on the requirements you want to fulfill.<br/>
They are execuatable specifications and will help developers to make confident changes, even after<br/>
months into a project.<br/> 
UX, Testing and DEV will always be able to refer to the same scenario - a shared artifact that will enable<br/>
new possibilites for team interactions.

## Real World Use
If you are interested how this can be used in real-world applications, there are two ways to get started.<br/>
1. UX <-> DEV tutorial that makes use of user-flows and demonstrates UX - DEV interactions.<br/>
2. RE  -> DEV tutorial that demonstrates how a list of requirements can be translated into code.<br/>


## Packages
flowcards can be easily integrated into modern frontend applications.

- [🌀 `@flowcards/core (documentation)`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/core) - core library (typed, tested & dependency-free)
- [![-](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/icon-react.png) `@flowcards/react`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/react) - React hook
- [![-](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/icon-svelte.png) `@flowcards/svelte`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/svelte) - Svelte store
- [![-](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/icon-mobx.png) `@flowcards/mobx`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/mobx) - MobX store
- [![-](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/img/icon-rxjs.png) `@flowcards/rxjs`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/rxjs) - Observable from BehaviorSubject
<br/>

## Contribute
If this hits a spot, send me a message and tell me about it.<br/>
You can be a developer, a designer or someone new to software development, i will appreciate your help.<br/>

## Scenario Based Programming (SBP) 
flowcards is an opinionated flavour of SBP<br/>
Based on [behavioural programmin principles](http://www.wisdom.weizmann.ac.il/~bprogram/more.html), flowcards adds pending-events, intercepts, event-chaches and a scaffolding-function, to enable a better integration to frontend app development.

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


