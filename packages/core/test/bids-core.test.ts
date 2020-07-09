import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { FCEvent } from "../src/event";
import { flow } from '../src/flow';



// REQUESTS & WAITS
//-------------------------------------------------------------------------
test("a requested event that is not blocked will advance", () => {
    let hasAdvanced = false;
    

    const requestingThread = flow({id: 'thread1'}, function*() {
        yield bp.request("A");
        hasAdvanced = true;
    });

    testScenarios((enable) => {
        enable(requestingThread());
    }, ({log})=> {
        expect(hasAdvanced).toBe(true);
        expect(log?.latestAction.event.name).toBe("A");
    });
});


test("a request will also advance waiting threads", () => {
    let requestProgressed: any, waitProgressed: any;

    const requestingThread = flow({id: 'thread1'}, function*() {
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
    }, ({log}) => {
        expect(requestProgressed).toBe(true);
        expect(waitProgressed).toBe(true);
        expect(log?.latestAction.event.name).toBe("A");
    });
});


test("waits will return the value that has been requested", () => {
    const requestThread = flow({id: 'requestThread'}, function* () {
        yield bp.request("A", 1000);
    });

    let receivedValue: any = null;

    const receiveThread = flow({id: 'receiveThread'}, function* () {
        receivedValue = yield bp.wait("A");
    });

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThread());
    }, ({log}) => {
        expect(receivedValue).toBe(1000);
        expect(log?.latestAction.event.name).toBe("A");
        expect(log?.latestAction.payload).toBe(1000);
    });
});


test("multiple requests will return an array of [eventId, value].", () => {
    let progressedeventId, receivedValueA, receivedValueB;

    const requestThread = flow(null, function* (): any {
        const [event] = yield [bp.request("A", 1000), bp.request("B", 2000)];
        progressedeventId = event.name;
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

    if (progressedeventId === "A") {
        expect(receivedValueA).toEqual(1000);
        expect(receivedValueB).toBeUndefined();
    } else {
        expect(receivedValueB).toBe(2000);
        expect(receivedValueA).toBeUndefined();
    }
});


test("multiple waits will return an array of [value, eventId].", () => {
    let receivedValue: any, receivedeventId: any;

    const requestThread = flow(null, function* () {
        yield bp.request("A", 1000);
    })

    const receiveThread = flow(null, function* () {
        [receivedeventId, receivedValue] = yield [bp.wait("A"), bp.wait("B")];
        expect(receivedValue).toBe(1000);
        expect(receivedeventId?.name).toBe("A");
    })

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThread());
    });


});


test("A request-value can be a function. It will get called, when the event is selected", () => {
    let receivedValue: any
    let receivedEvent: FCEvent;

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
    });

    expect(receivedValue1).toBe(1000);
    expect(receivedValue2).toBe(1000);
    expect(fnCount).toBe(1);
});


test("When there are multiple requests with the same event-name, the payload from the higher priority threads gets chosen", () => {
    let receivedValue;

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
        enable(requestThreadHigher());
        enable(receiveThread());
    });

    expect(receivedValue).toBe(2);
});


// BLOCK
//-------------------------------------------------------------------------

test("events can be blocked", () => {
    let advancedRequest, advancedWait;

    const requestThread = flow(null, function* () {
        yield bp.request("AX", 1000);
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
    });

    expect(advancedRequest).toBeUndefined();
    expect(advancedWait).toBeUndefined();
});


test("if an async request gets blocked, it will not call the promise", () => {
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