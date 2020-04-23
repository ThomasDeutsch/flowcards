/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from "../src/index";
import { FCEvent } from "../src/event";



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
        expect(log.latestAction.event.name).toBe("A");
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
        expect(log.latestAction.event.name).toBe("A");
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
        expect(log.latestAction.event.name).toBe("A");
        expect(log.latestAction.payload).toBe(1000);
        expect(log.latestReactionByThreadId).toHaveProperty("requestThread");
        expect(log.latestReactionByThreadId).toHaveProperty("receiveThread");
    });
});


test("multiple requests will return an array of [eventId, value].", () => {
    let progressedeventId, receivedValueA, receivedValueB;

    function* requestThread(): any {
        const [event] = yield [bp.request("A", 1000), bp.request("B", 2000)];
        progressedeventId = event.name;
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

    if (progressedeventId === "A") {
        expect(receivedValueA).toEqual(1000);
        expect(receivedValueB).toBeUndefined();
    } else {
        expect(receivedValueB).toBe(2000);
        expect(receivedValueA).toBeUndefined();
    }
});


test("multiple waits will return an array of [value, eventId].", () => {
    let receivedValue, receivedeventId;

    function* requestThread() {
        yield bp.request("A", 1000);
    }

    function* receiveThread() {
        [receivedeventId, receivedValue] = yield [bp.wait("A"), bp.wait("B")];
        expect(receivedValue).toBe(1000);
        expect(receivedeventId?.name).toBe("A");
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(receiveThread);
    }, null);


});


test("A request-value can be a function. It will get called, when the event is selected", () => {
    let receivedValue: unknown
    let receivedEvent: FCEvent;

    function* requestThread() {
        yield bp.request("A", () => 1000);
    }

    function* receiveThread() {
        [receivedEvent, receivedValue] = yield [bp.wait("A"), bp.wait("B")];
        expect(receivedValue).toBe(1000);
        expect(receivedEvent?.name).toBe("A");
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(receiveThread);
    }, null);
    

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
        yield bp.request("AX", 1000);
        advancedRequest = true;
    }

    function* waitingThread() {
        yield bp.wait("AX");
        advancedWait = true;
    }

    function* blockingThread() {
        yield bp.block("AX");
    }

    scenarios((enable) => {
        
        enable(requestThread);
        enable(waitingThread);
        enable(blockingThread);
    }, null);

    expect(advancedRequest).toBeUndefined();
    expect(advancedWait).toBeUndefined();
});


test("if an async request gets blocked, it will not call the promise", () => {
    let calledFunction = false;

    function* requestingThread() {
        yield bp.request("AX", () => { calledFunction = true; });
    }

    function* blockingThread() {
        yield bp.block("AX");
    }

    scenarios((enable) => {
        enable(requestingThread);
        enable(blockingThread);
    }, null);
    expect(calledFunction).toBe(false);
});
