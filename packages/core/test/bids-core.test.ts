import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { EventId } from "../src/event-map";
import { flow } from '../src/scenario';


// REQUESTS & WAITS
//-------------------------------------------------------------------------
test("a requested event that is not blocked will advance", () => {
    let hasAdvanced = false;

    const requestingThread = flow({name: 'thread1'}, function*() {
        yield bp.request("A");
        hasAdvanced = true;
    });

    testScenarios((enable) => {
        enable(requestingThread());
    }, ({thread})=> {
        expect(hasAdvanced).toBe(true);
        expect(thread.get({name: 'thread1'})?.isCompleted).toBe(true);
    });
});



test("a request will also advance waiting threads", () => {
    let requestProgressed: any, waitProgressed: any;

    const requestingThread = flow({name: 'thread1'}, function*() {
        yield bp.request("A");
        requestProgressed = true;
    });

    const waitingThread = flow(null, function*() {
        yield bp.wait("A");
        waitProgressed = true;
    });

    testScenarios((enable) => {
        enable(requestingThread());
        enable(waitingThread());
    }, () => {
        expect(requestProgressed).toBe(true);
        expect(waitProgressed).toBe(true);
    });
});


test("waits will return the value that has been requested", () => {
    const requestThread = flow({name: 'requestThread'}, function* () {
        yield bp.request("A", 1000);
    });

    let receivedValue: any = null;

    const receiveThread = flow({name: 'receiveThread'}, function* () {
        receivedValue = yield bp.wait("A");
    });

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThread());
    }, () => {
        expect(receivedValue).toBe(1000);
    });
});


test("multiple requests will return an array of [eventId, value].", () => {
    let progressedEventId, receivedValueA, receivedValueB;

    const requestThread = flow(null, function* (): any {
        const [event] = yield [bp.request("A", 1000), bp.request("B", 2000)];
        progressedEventId = event.name;
    });

    const receiveThreadA = flow(null, function* () {
        receivedValueA = yield bp.wait("A");
    });

    const receiveThreadB = flow(null, function* () {
        receivedValueB = yield bp.wait("B");
    });

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThreadA());
        enable(receiveThreadB());
    });

    if (progressedEventId === "A") {
        expect(receivedValueA).toEqual(1000);
        expect(receivedValueB).toBeUndefined();
    } else {
        expect(receivedValueB).toBe(2000);
        expect(receivedValueA).toBeUndefined();
    }
});


test("multiple waits will return an array of [value, eventId].", () => {
    let receivedValue: any, receivedEventId: any;

    const requestThread = flow(null, function* () {
        yield bp.request("A", 1000);
    })

    const receiveThread = flow(null, function* () {
        [receivedEventId, receivedValue] = yield [bp.wait("A"), bp.wait("B")];
        expect(receivedValue).toBe(1000);
        expect(receivedEventId?.name).toBe("A");
    })

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThread());
    });
});


test("A request-value can be a function. It will get called, when the event is selected", () => {
    let receivedValue: any
    let receivedEvent: EventId;

    const requestThread = flow(null, function* () {
        yield bp.request("A", () => 1000);
    })

    const receiveThread = flow(null, function* () {
        [receivedEvent, receivedValue] = yield [bp.wait("A"), bp.wait("B")];
        expect(receivedValue).toBe(1000);
        expect(receivedEvent?.name).toBe("A");
    })

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThread());
    });
});


test("if a request value is a function, it will only be called once.", () => {
    let receivedValue1 = 1000,
        receivedValue2 = 1000,
        fnCount = 0;

    const requestThread = flow(null, function* () {
        yield bp.request("A", () => {
            fnCount++;
            return 1000;
        });
    });

    const receiveThread1 = flow(null, function* () {
        receivedValue1 = yield bp.wait("A");
    });

    const receiveThread2 = flow(null, function* () {
        receivedValue2 = yield bp.wait("A");
    })

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThread1());
        enable(receiveThread2());
    }, () => {
        expect(receivedValue1).toBe(1000);
        expect(receivedValue2).toBe(1000);
        expect(fnCount).toBe(1);
    });
});

test("When there are multiple requests with the same event-name, the request with the higher priority will get selected first", () => {
    let receivedValue: number;

    const requestThreadLower = flow(null, function* () {
        yield bp.request("A", 1);
    });

    const requestThreadHigher = flow(null, function* () {
        yield bp.request("A", 2);
    });

    const receiveThread = flow(null, function* () {
        receivedValue = yield bp.wait("A");
    })

    testScenarios((enable) => {
        enable(requestThreadLower());
        enable(requestThreadHigher()); // this thread has a higher priority, because it gets enabled later than the first one.
        enable(receiveThread());
    }, () => {
        expect(receivedValue).toBe(2);
    });
});


// BLOCK
//-------------------------------------------------------------------------

test("events can be blocked", () => {
    let advancedRequest: boolean, advancedWait: boolean;

    const requestThread = flow(null, function* () {
        yield bp.request("AX");
        advancedRequest = true;
    });

    const waitingThread = flow(null, function* () {
        yield bp.wait("AX");
        advancedWait = true;
    });

    const blockingThread = flow(null, function* () {
        yield bp.block("AX");
    });

    testScenarios((enable) => {
        
        enable(requestThread());
        enable(waitingThread());
        enable(blockingThread());
    }, () => {
        expect(advancedRequest).toBeUndefined();
        expect(advancedWait).toBeUndefined();
    });
});


test("if an async request gets blocked, it will not call the bid-function", () => {
    let calledFunction = false;

    const requestingThread = flow(null, function* () {
        yield bp.request("AX", () => { calledFunction = true; });
    })

    const blockingThread = flow(null, function* () {
        yield bp.block("AX");
    })

    testScenarios((enable) => {
        enable(requestingThread());
        enable(blockingThread());
    });
    expect(calledFunction).toBe(false);
});


test("a requested event with a key is blocked by a block for the same event that has no key", () => {
    let progressedRequestThread = false;

    const requestingThread = flow(null, function* () {
        yield bp.request({name: 'AX', key: 1});
        progressedRequestThread = true;
    })

    const blockingThread = flow(null, function* () {
        yield bp.block("AX");
    })

    testScenarios((enable) => {
        enable(requestingThread());
        enable(blockingThread());
    });
    expect(progressedRequestThread).toBe(false);
});


test("a requested event with a key is blocked by a block with the same event-name and -key", () => {
    let progressedRequestThread1 = false;
    let progressedRequestThread2 = false;

    const requestingThread = flow(null, function* () {
        yield bp.request({name: 'AX', key: 1});
        progressedRequestThread1 = true;
        yield bp.request({name: 'AX', key: 2});
        progressedRequestThread2 = true;
    })

    const blockingThread = flow(null, function* () {
        yield bp.block({name: 'AX', key: 2});
    })

    testScenarios((enable) => {
        enable(requestingThread());
        enable(blockingThread());
    });
    expect(progressedRequestThread1).toBe(true);
    expect(progressedRequestThread2).toBe(false);
});


test("a keyed wait will not progress on an event that is more general", () => {
    let requestProgressed = false, waitProgressed = false;

    const requestingThread = flow({name: 'thread1'}, function*() {
        yield bp.request("A");
        requestProgressed = true;
    });

    const waitingThread = flow(null, function*() {
        yield [bp.wait({name: 'A', key: 1}), bp.wait({name: 'A', key: 2})];
        waitProgressed = true;
    });

    testScenarios((enable) => {
        enable(requestingThread());
        enable(waitingThread());
    }, () => {
        expect(requestProgressed).toBe(true);
        expect(waitProgressed).toBe(false);
    });
});


test("a wait without a key will react to keyed events with the same name", () => {
    let requestProgressed: any, waitProgressed: any;

    const requestingThread = flow({name: 'thread1'}, function*() {
        yield bp.request({name: 'A', key: 1});
        requestProgressed = true;
    });

    const waitingThread = flow(null, function*() {
        yield bp.wait('A');
        waitProgressed = true;
    });

    testScenarios((enable) => {
        enable(requestingThread());
        enable(waitingThread());
    }, () => {
        expect(requestProgressed).toBe(true);
        expect(waitProgressed).toBe(true);
    });
});