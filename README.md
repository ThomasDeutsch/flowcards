## flowcards

when your UI-framework is about modular components<br/>
then flowcards is about modular behaviours.

You can compare flowcards with [XState](https://github.com/davidkpiano/xstate).<br/>
Both add a layer on top of your component structure<br/>
to enable new ways to describe/model dynamic UI behaviours.<br/>

## Why flowcards?

Difference between XState and Flowcards.

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

function* sender() {
    yield request('event', 'well done!');
    yield request('event', 'you are making progress');
}

function* receiver() {
    while(true) {
        const message = yield wait('event');
        console.log('received message: ', message);
    }
}

scenarios(enable => {
    enable(sender);
    enable(receiver);
});
```
