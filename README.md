# flowcards

flowcards is about modular behaviours.<br/>
Enabling "scenario based programming" for your JS application.

You can compare flowcards to [XState](https://github.com/davidkpiano/xstate).<br/>
They enable new ways to describe/model reactive systems<br/>
and can serve as a layer above your UI-component structure.

## Why flowcards?

Todo: Difference between XState and Flowcards.

## Packages

- [🌀 `@flowcards/core`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/core) - core library (typed, tested & dependency-free)
- [⚛️ `@flowcards/react`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/react) - React hooks and utilities
- ❇️ fork this repository and add support for your favorite framework.

## Quick Start

```
npm install @flowcards/core
```

```javascript
import { scenarios, request, wait } from @flowcards/core;

const delayed = (data, ms) => new Promise(r => setTimeout(() => r(data), ms));

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
