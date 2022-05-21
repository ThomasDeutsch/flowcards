import { Flow } from "../src/flow";
import * as bp from "../src/bid";
import { FlowEvent, FlowEventKeyed, UserEventKeyed } from "../src/event";
import { testScenarios } from "./testutils";


test("keys can be a string or a number", () => {
    const eventA = new UserEventKeyed('A');

    const thread1 = new Flow('thread1', function* () {
        yield bp.askFor(eventA.key('1'));
    });

    testScenarios((e, f) => {
        e(eventA.keys("1", 2));
        f(thread1);
    }, ()=> {
        expect(eventA.key("1").isConnected).toBe(true);
        expect(eventA.key(1).isConnected).toBe(false);
        expect(eventA.key(2).isConnected).toBe(true);
    });
});

test("a requested event with a key is blocked by a block for the same name and key", () => {

    let progressedRequestThread = false;

    const eventA = new FlowEventKeyed('A');

    const requestingThread = new Flow('thread1', function* () {
        yield bp.request(eventA.key(1));
        progressedRequestThread = true;
    })

    const blockingThread = new Flow('thread2', function* () {
        yield bp.validate(eventA.key(1), () => false);
    })

    testScenarios((e, f) => {
        e(eventA.key(1));
        f(requestingThread);
        f(blockingThread);
    });
    expect(progressedRequestThread).toBe(false);
});

test("a requested event with a disabled key will not progress", () => {

    let progressedRequestThread = false;

    const eventA = new FlowEventKeyed('A');

    const requestingThread = new Flow('thread1', function* () {
        yield bp.request(eventA.key(1));
        progressedRequestThread = true;
    })

    testScenarios((e, f) => {
        e(eventA.key(2));
        f(requestingThread);
    });
    expect(progressedRequestThread).toBe(false);
});


test("a keyed waitFor will not advance on the same Event-Name without a Key", () => {
    let requestProgressed = false, waitProgressed = false;

    const eventAUnkeyed = new FlowEvent('A');
    const eventA = new FlowEventKeyed('A');

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventAUnkeyed);
        requestProgressed = true;
    });

    const waitingThread = new Flow('thread2', function*() {
        yield [bp.waitFor(eventA.key(1)), bp.waitFor(eventA.key(2))];
        waitProgressed = true;
    });

    testScenarios((e, f) => {
        e([eventAUnkeyed, ...eventA.keys(1,2)]);
        f(requestingThread);
        f(waitingThread);
    }, () => {
        expect(requestProgressed).toBe(true);
        expect(waitProgressed).toBe(false);
    });
});


test("a wait without a key will not react to keyed events with the same name", () => {
    let requestProgressed = false,
        waitProgressed = false;

    const eventA = new FlowEventKeyed('A');
    const eventAUK = new FlowEvent('A');

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventA.key(1));
        requestProgressed = true;
    });

    const waitingThread = new Flow('thread2', function*() {
        yield bp.waitFor(eventAUK);
        waitProgressed = true;
    });

    testScenarios((e, f) => {
        e([eventA.key(1), eventAUK]);
        f(requestingThread);
        f(waitingThread);
    }, () => {
        expect(requestProgressed).toBe(true);
        expect(waitProgressed).toBe(false);
    });
});


test("an event with a key will be blocked by a block with the same name and key", () => {
    let advancedKey1 = false;
    let advancedKey2 = false;

    const eventA = new FlowEventKeyed('A');

    const thread1 = new Flow('thread1', function* () {
        yield bp.waitFor(eventA.key(1));
        advancedKey1 = true;
    });

    const thread2 = new Flow('thread2', function* () {
        yield bp.waitFor(eventA.key(2));
        advancedKey2 = true;
    });

    const blockingThread = new Flow('thread3', function* () {
        yield bp.validate(eventA.key(1), () => false);
    });

    const requestingThread = new Flow('thread4', function* () {
        yield bp.request(eventA.key(2));
        yield bp.request(eventA.key(1));
    });

    testScenarios((e, f) => {
        e([...eventA.keys(1, 2)]);
        f(thread1);
        f(thread2);
        f(blockingThread);
        f(requestingThread);
    }, ()=> {
        expect(advancedKey1).toEqual(false);
        expect(advancedKey2).toEqual(true);
    });
});


test("a request without a key will not advance waiting threads with a key", () => {
    let advancedWait1 = false;
    let advancedWait2 = false;

    const eventA = new FlowEvent('A');
    const eventAK = new FlowEventKeyed('A');

    const waitThreadWithKey1 = new Flow('thread1', function* () {
        yield bp.waitFor(eventAK.key(1));
        advancedWait1 = true;
    });

    const waitThreadWithKey2 = new Flow('thread2', function* () {
        yield bp.waitFor(eventAK.key(2));
        advancedWait2 = true;
    });

    const requestThread = new Flow('thread3', function* () {
        yield bp.request(eventA);
    });

    testScenarios((e, f) => {
        e([eventA, ...eventAK.keys(1, 2)]);
        f(waitThreadWithKey1);
        f(waitThreadWithKey2);
        f(requestThread);
    }, ()=> {
        expect(advancedWait1).toEqual(false);
        expect(advancedWait2).toEqual(false);
    });
});


test("an request without a key will not advance extends with a key", () => {
    let advancedExtend = false;
    const eventA = new FlowEvent('A');
    const eventAK = new FlowEventKeyed('A');

    const extending = new Flow('thread1', function* () {
        yield bp.extend(eventAK.key(1));
        advancedExtend = true;
    });

    const requesting = new Flow('thread2', function* () {
        yield bp.request(eventA);
    });

    testScenarios((e, f) => {
        e([eventA, ...eventAK.keys(1)]);
        f(extending);
        f(requesting);
    }, ()=> {
        expect(advancedExtend).toEqual(false);
    });
});


test("a request with a key, will only advance the matching wait with the same key, and not waits without a key", () => {
    let advancedWait1 = false;
    let advancedWait2 = false;
    let advancedWaitNoKey = false;

    const eventA = new FlowEvent('A');
    const eventAK = new FlowEventKeyed('A');

    const waitThreadWithKey1 = new Flow('thread1', function* () {
        yield bp.waitFor(eventAK.key(1));
        advancedWait1 = true;
    });

    const waitThreadWithKey2 = new Flow('thread2', function* () {
        yield bp.waitFor(eventAK.key(2));
        advancedWait2 = true;
    });

    const waitThreadWithoutKey = new Flow('thread3', function* () {
        yield bp.waitFor(eventA);
        advancedWaitNoKey = true;
    });

    const requestThread = new Flow('thread4', function* () {
        yield bp.request(eventAK.key(1));
    });

    testScenarios((e, f) => {
        e([eventA, ...eventAK.keys(1,2)]);
        f(waitThreadWithKey1);
        f(waitThreadWithKey2);
        f(waitThreadWithoutKey);
        f(requestThread);
    }, ()=> {
        expect(advancedWait1).toEqual(true);
        expect(advancedWait2).toEqual(false);
        expect(advancedWaitNoKey).toEqual(false);
    });
});
