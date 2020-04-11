/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from "../src/index";


// REQUESTS & WAITS
//-------------------------------------------------------------------------

test("a requested event that is not blocked will advance", () => {
    let hasAdvanced = false;

    function* thread1() {
        yield bp.request("A");
        hasAdvanced = true;
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({log})=> {
        expect(hasAdvanced).toBe(true);
        expect(log.latestAction.eventName).toBe("A");
        expect(log.latestReactionByThreadId).toHaveProperty("thread1");
    });
});


test("a request will also advance waiting threads", () => {
    let requestProgressed: any, waitProgressed: any;

    function* thread1() {
        yield bp.request("A");
        requestProgressed = true;
    }
    function* thread2() {
        yield bp.wait("A");
        waitProgressed = true;
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, ({log}) => {
        expect(requestProgressed).toBe(true);
        expect(waitProgressed).toBe(true);
        expect(log.latestAction.eventName).toBe("A");
        expect(log.latestReactionByThreadId).toHaveProperty("thread1");
        expect(log.latestReactionByThreadId).toHaveProperty("thread1");
    });
});


test("waits will return the value that has been requested", () => {
    function* requestThread() {
        yield bp.request("A", 1000);
    }

    let receivedValue: any = null;

    function* receiveThread() {
        receivedValue = yield bp.wait("A");
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(receiveThread);
    }, ({log}) => {
        expect(receivedValue).toBe(1000);
        expect(log.latestAction.eventName).toBe("A");
        expect(log.latestAction.payload).toBe(1000);
        expect(log.latestReactionByThreadId).toHaveProperty("requestThread");
        expect(log.latestReactionByThreadId).toHaveProperty("receiveThread");
    });
});


test("multiple requests will return an array of [eventName, value].", () => {
    let progressedEventName, receivedValueA, receivedValueB;

    function* requestThread() {
        const [eventName] = yield [bp.request("A", 1000), bp.request("B", 2000)];
        progressedEventName = eventName;
    }

    function* receiveThreadA() {
        receivedValueA = yield bp.wait("A");
    }

    function* receiveThreadB() {
        receivedValueB = yield bp.wait("B");
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(receiveThreadA);
        enable(receiveThreadB);
    }, null);

    if (progressedEventName === "A") {
        expect(receivedValueA).toBe(1000);
        expect(receivedValueB).toBeUndefined();
    } else {
        expect(receivedValueB).toBe(2000);
        expect(receivedValueA).toBeUndefined();
    }
});


test("multiple waits will return an array of [value, eventName].", () => {
    let receivedValue, receivedEventName;

    function* requestThread() {
        yield bp.request("A", 1000);
    }

    function* receiveThread() {
        [receivedEventName, receivedValue] = yield [bp.wait("A"), bp.wait("B")];
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(receiveThread);
    }, null);

    expect(receivedValue).toBe(1000);
    expect(receivedEventName).toBe("A");
});


test("A request-value can be a function. It will get called, when the event is selected", () => {
    let receivedValue, receivedEventName;

    function* requestThread() {
        yield bp.request("A", () => 1000);
    }

    function* receiveThread() {
        [receivedEventName, receivedValue] = yield [bp.wait("A"), bp.wait("B")];
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(receiveThread);
    }, null);
    
    expect(receivedValue).toBe(1000);
    expect(receivedEventName).toBe("A");
});


test("if a request value is a function, it will only be called once.", () => {
    let receivedValue1 = 1000,
        receivedValue2 = 1000,
        fnCount = 0;

    function* requestThread() {
        yield bp.request("A", () => {
            fnCount++;
            return 1000;
        });
    }

    function* receiveThread1() {
        receivedValue1 = yield bp.wait("A");
    }

    function* receiveThread2() {
        receivedValue2 = yield bp.wait("A");
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(receiveThread1);
        enable(receiveThread2);
    }, null);

    expect(receivedValue1).toBe(1000);
    expect(receivedValue2).toBe(1000);
    expect(fnCount).toBe(1);
});


test("When there are multiple requests with the same event-name, the payload from the higher priority threads gets chosen", () => {
    let receivedValue;

    function* requestThreadLower() {
        yield bp.request("A", 1);
    }
    function* requestThreadHigher() {
        yield bp.request("A", 2);
    }

    function* receiveThread() {
        receivedValue = yield bp.wait("A");
    }

    scenarios((enable) => {
        enable(requestThreadLower);
        enable(requestThreadHigher);
        enable(receiveThread);
    }, null);

    expect(receivedValue).toBe(2);
});


// BLOCK
//-------------------------------------------------------------------------

test("events can be blocked", () => {
    let advancedRequest, advancedWait;

    function* requestThread() {
        yield bp.request("A", 1000);
        advancedRequest = true;
    }

    function* waitingThread() {
        yield bp.wait("A");
        advancedWait = true;
    }

    function* blockingThread() {
        yield bp.block("A");
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(waitingThread);
        enable(blockingThread);
    }, null);

    expect(advancedRequest).toBeUndefined();
    expect(advancedWait).toBeUndefined();
});


// INTERCEPTS
//-------------------------------------------------------------------------

test("requests can be intercepted", () => {
    let progressedRequest = false,
        progressedIntercept = false,
        setupCount = 0;

    function* thread1() {
        yield bp.request("A");
        progressedRequest = true;
    }

    function* thread3() {
        yield bp.intercept("A");
        progressedIntercept = true;
        yield bp.wait('X');
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread3);
        setupCount++;
    }, ({log}) => {
        expect(log.currentPendingEvents.has('A')).toEqual(true);
    }
 );
    expect(setupCount).toEqual(2);
    expect(progressedRequest).toBe(false);
    expect(progressedIntercept).toBe(true);
});

test("if an intercepted thread completed, without resolving or rejecting the event, it will keep the event pending", () => {
    let progressedRequest = false,
        progressedIntercept = false,
        setupCount = 0;

    function* thread1() {
        yield bp.request("A");
        progressedRequest = true;
    }

    function* thread3() {
        yield bp.intercept("A");
        progressedIntercept = true;
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread3);
        setupCount++;
    }, ({log}) => {
        expect(log.currentPendingEvents.has('A')).toEqual(true);
    }
 );
    expect(setupCount).toEqual(2);
    expect(progressedRequest).toBe(false);
    expect(progressedIntercept).toBe(true);
});


test("intercepts will receive a value (like waits)", () => {
    let interceptedValue;

    function* thread1() {
        yield bp.request("A", 1000);
    }

    function* thread2() {
        yield bp.wait("A");
    }

    function* thread3() {
        interceptedValue = yield bp.intercept("A");
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
        enable(thread3);
    }, null);

    expect(interceptedValue).toBe(1000);
});


test("intercepts will intercept requests", () => {
    let interceptedValue;

    function* thread1() {
        yield bp.request("A", 1000);
    }

    function* thread2() {
        interceptedValue = yield bp.intercept("A");
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, null);

    expect(interceptedValue).toEqual(1000);
});


test("the last intercept that is enabled has the highest priority", () => {
    let advancedThread1, advancedThread2;

    function* requestThread() {
        yield bp.request("A");
    }

    function* interceptThread1() {
        yield bp.intercept("A");
        advancedThread1 = true;
    }
    
    function* interceptThread2() {
        yield bp.intercept("A");
        advancedThread2 = true;
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(interceptThread1);
        enable(interceptThread2);
    }, null);

    expect(advancedThread1).toBeFalsy();
    expect(advancedThread2).toBe(true);
});