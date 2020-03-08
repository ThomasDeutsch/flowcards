## flowcards

when your UI-framework is about modular components<br/>
then flowcards is about modular behaviours.

You can compare flowcards with [XState](https://github.com/davidkpiano/xstate).<br/>
Both add a layer on top of your component structure<br/>
to enable new ways to describe/model dynamic UI behaviours.<br/>

## Why flowcards?

Difference between XState and Flowcards.

## Packages

- [🌀 `@flowcards/core`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/core) - core library (typed & tested & dependency-free)
- [⚛️ `@flowcards/react`](https://github.com/ThomasDeutsch/flowcards/tree/master/packages/react) - React hooks and utilities
- ❇️ you want to add support for another framework? - please contact me!

## Quick Start

```
npm install @flowcards/core
```

```javascript
import { createUpdateLoop } from @flowcards/core;

function* sender() {
    yield request('msg', 'hello world');
}

function* receiver() {
    const value = yield wait('msg');
    console.log('received message:', value);
}

createUpdateLoop((enable => {
    enable(sender);
    enable(receiver);
}), () => null);

```
