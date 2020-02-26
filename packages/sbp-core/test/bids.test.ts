// ---------- guards & waits/intercepts
// a wait can be guarded
// an intercept can be guarded

// ---------- guards & blocks
// blocks can be guarded
// if there is an unguared block and a guarded block - the guard will have no effect
// different guards are merged
// a wait guard and a block guard for the same event are merged.
// if a bid is a function, it get reevaluated every cycle
// a function can result in an array or single event


// FOR EVERY FEATURE, EXPAIN WHY
// 2. A generator is reset with argument change. Why? ->  argument-changes are a context changes. you can pass Objects to prevent changes.
// 3. You do not want to introduce new events. You want to make decisions, based on the payload - so there needs to be guards-functions.
//    AND it will be easier to block AND other threads do not know all kind of different events.
//    also a big change: a guard can be used to verify the user-input (prevent invalid events fired from the UI!)


import bp from "../../src/core/index";
import { createUpdateLoop } from "../../src/core/updateloop";
import { Logger } from "../../src/core/logger";

let updateLoop: Function;

beforeEach(() => {
    updateLoop = (enable: Function): Logger => {
        const logger = new Logger();
        createUpdateLoop(enable, () => null, logger)();
        return logger;
    };
});

// REQUESTS & WAITS
//-------------------------------------------------------------------------

test("a requested event that is not blocked will advance", () => {
    let hasAdvanced = false;

    function* thread1() {
        yield bp.request("A");
        hasAdvanced = true;
    }
    const logger = updateLoop((enable: any) => {
        enable(thread1);
    });
    expect(hasAdvanced).toBe(true);
    expect(logger.getLatestAction().eventName).toBe("A");
    expect(logger.getLatestReactionThreads()).toContain("thread1");
});

test("a request will also advance waiting threads", () => {
    let requestProgressed, waitProgressed;

    function* thread1() {
        yield bp.request("A");
        requestProgressed = true;
    }
    function* thread2() {
        yield bp.wait("A");
        waitProgressed = true;
    }

    const logger = updateLoop((enable: any) => {
        enable(thread1);
        enable(thread2);
    });
    expect(requestProgressed).toBe(true);
    expect(waitProgressed).toBe(true);
    expect(logger.getLatestAction().eventName).toBe("A");
    expect(logger.getLatestReactionThreads()).toContain("thread1");
    expect(logger.getLatestReactionThreads()).toContain("thread2");
});

test("waits will return the value that has been requested", () => {
    function* requestThread() {
        yield bp.request("A", 1000);
    }
    let receivedValue = null;
    function* receiveThread() {
        receivedValue = yield bp.wait("A");
    }
    const logger = updateLoop((enable: any) => {
        enable(requestThread);
        enable(receiveThread);
    });
    expect(receivedValue).toBe(1000);
    expect(logger.getLatestAction().eventName).toBe("A");
    expect(logger.getLatestAction().payload).toBe(1000);
    expect(logger.getLatestReactionThreads()).toContain("requestThread");
    expect(logger.getLatestReactionThreads()).toContain("receiveThread");
});

test("multiple requests will return an array of [value, eventName].", () => {
    let progressedEventName, receivedValueA, receivedValueB;

    function* requestThread() {
        const [value, eventName] = yield [bp.request("A", 1000), bp.request("B", 2000)];
        progressedEventName = eventName;
    }
    function* receiveThreadA() {
        receivedValueA = yield bp.wait("A");
    }
    function* receiveThreadB() {
        receivedValueB = yield bp.wait("B");
    }
    updateLoop((enable: any) => {
        enable(requestThread);
        enable(receiveThreadA);
        enable(receiveThreadB);
    });
    if (progressedEventName === "A") {
        expect(receivedValueA).toBe(1000);
        expect(receivedValueB).toBeUndefined();
    } else {
        expect(receivedValueA).toBeUndefined();
        expect(receivedValueB).toBe(2000);
    }
});

test("multiple waits will return an array of [value, eventName].", () => {
    let receivedValue, receivedEventName;

    function* requestThread() {
        yield bp.request("A", 1000);
    }
    function* receiveThread() {
        [receivedValue, receivedEventName] = yield [bp.wait("A"), bp.wait("B")];
    }
    updateLoop((enable: any) => {
        enable(requestThread);
        enable(receiveThread);
    });
    expect(receivedValue).toBe(1000);
    expect(receivedEventName).toBe("A");
});

test("A request-value can be a function.", () => {
    let receivedValue, receivedEventName;

    function* requestThread() {
        yield bp.request("A", () => 1000);
    }
    function* receiveThread() {
        [receivedValue, receivedEventName] = yield [bp.wait("A"), bp.wait("B")];
    }
    updateLoop((enable: any) => {
        enable(requestThread);
        enable(receiveThread);
    });
    expect(receivedValue).toBe(1000);
    expect(receivedEventName).toBe("A");
});

test("if a request value is a function, it will only be called once.", () => {
    let receivedValue1: number = 1000,
        receivedValue2: number = 1000,
        fnCount: number = 0;
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
    updateLoop((enable: any) => {
        enable(requestThread);
        enable(receiveThread1);
        enable(receiveThread2);
    });
    expect(receivedValue1).toBe(1000);
    expect(receivedValue2).toBe(1000);
    expect(fnCount).toBe(1);
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
    updateLoop((enable: any) => {
        enable(requestThread);
        enable(waitingThread);
        enable(blockingThread);
    });
    expect(advancedRequest).toBeUndefined();
    expect(advancedWait).toBeUndefined();
});

// INTERCEPTS
//-------------------------------------------------------------------------

test("waits can be intercepted", () => {
    let progressedRequest = false,
        progressedWait = false,
        progressedIntercept = false;
    function* thread1() {
        yield bp.request("A");
        progressedRequest = true;
    }
    function* thread2() {
        yield bp.wait("A");
        progressedWait = true;
    }
    function* thread3() {
        yield bp.intercept("A");
        progressedIntercept = true;
    }
    updateLoop((enable: any) => {
        enable(thread1);
        enable(thread2);
        enable(thread3);
    });
    expect(progressedRequest).toBe(true);
    expect(progressedWait).toBe(false);
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
    updateLoop((enable: any) => {
        enable(thread1);
        enable(thread2);
        enable(thread3);
    });
    expect(interceptedValue).toBe(1000);
});

test("intercepts are only advanced, if there is a wait for the same eventName", () => {
    let interceptedValue;

    function* thread1() {
        yield bp.request("A", 1000);
    }
    function* thread2() {
        interceptedValue = yield bp.intercept("A");
    }
    updateLoop((enable: any) => {
        enable(thread1);
        enable(thread2);
    });
    expect(interceptedValue).toBeUndefined();
});

test("the last intercept that is enabled has the highest priority", () => {
    let advancedThread1, advancedThread2;

    function* requestThread() {
        yield bp.request("A");
    }
    function* waitThread() {
        yield bp.wait("A");
    }
    function* interceptThread1() {
        yield bp.intercept("A");
        advancedThread1 = true;
    }
    function* interceptThread2() {
        yield bp.intercept("A");
        advancedThread2 = true;
    }
    updateLoop((enable: any) => {
        enable(requestThread);
        enable(waitThread);
        enable(interceptThread1);
        enable(interceptThread2);
    });
    expect(advancedThread1).toBeFalsy();
    expect(advancedThread2).toBe(true);
});

// INVALID
// ---------------------------------------------------------------------

// test("A thread can only exclusively (request,block,wait or intercept) the same event at a time", () => {
//     const eventName = "event1";
//     function* thread1() {
//         yield bp.request(eventName);
//     }
//     function* thread2() {
//         yield bp.request(eventName);
//     }

//     expect(
//         testLoop((enable: any) => {
//             enable(thread1);
//             enable(thread2);
//         })
//     ).toThrow(Error);
// });