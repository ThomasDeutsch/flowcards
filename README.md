# flowcards

a tool to enable behaviour - flow by flow.

You can compare flowcards to [XState](https://github.com/davidkpiano/xstate).<br/>
They both enable ways to describe & model reactive systems.<br/>
Use them for well defined state-transitions, and free yourself from switch-case reducers.<br/>
`App(state) => UI` becomes `App(flowcards(scenarios)) => UI`<br/>

The idea comes from [user-flows](https://miro.medium.com/max/1400/1*fTafSXeAHjbELTxDHttWuQ.png). They provide an inter-object description of a reactive system.<br/>
Instead of describing the full reactivity of each component object-by-object (like XState),<br/>
we can define a system by the scenarios we want to enable flow-by-flow.<br/>
To enable behaviour - flow by flow - is what flowcards is all about.<br/>
<br/>
flowcards is based on [behavioral programming principles](http://www.wisdom.weizmann.ac.il/~bprogram/more.html).<br/>
👉 [This guide & sample application](https://github.com/ThomasDeutsch/flowcards/blob/master/docs/tutorialTodoMvc.md) will introduce you to the idea.<br/>

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


