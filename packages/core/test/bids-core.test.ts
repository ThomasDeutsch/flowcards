import { BThreadPublicContext, Scenario } from "../src";
import * as bp from "../src/bid";
import { ScenarioEvent, ScenarioEventKeyed } from "../src/scenario-event";
import { delay, testScenarios } from "./testutils";

// REQUESTS & WAITS
//-------------------------------------------------------------------------
test("a requested event that is not blocked will advance", () => {
    interface TestProps {
        a: number
    }

    const basicEvent = {
        eventA: new ScenarioEvent<number>('A'),
        eventB: new ScenarioEvent<number>('B')
    }

    const requestingThread = new Scenario<TestProps>('thread1', function*(context) {
        const progress = yield bp.request(basicEvent.eventA, 1);
        expect(progress.event).toBe(basicEvent.eventA);
        expect(context.a).toEqual(123);
        expect(typeof context.a).toEqual('number');
        expect(this.key).toBe(undefined);
    });

    testScenarios((s, e) => {
        e(basicEvent.eventA, basicEvent.eventB);
        s(requestingThread, {a: 123});
    }, ()=> {
        expect(requestingThread.isCompleted).toBe(true);
    });
});


test("a request will also advance waiting Scenarios", () => {
    const eventA = new ScenarioEvent<number>('A');

    const requestingThread = new Scenario('thread1', function*() {
        yield bp.request(eventA, 1);
    });

    const askingThread = new Scenario('askingThread', function*() {
        yield bp.askFor(eventA);
    });

    const waitingThread = new Scenario('waitingThread', function*() {
        yield bp.waitFor(eventA);
    });

    testScenarios((s, e) => {
        e(eventA);
        s(requestingThread);
        s(askingThread);
        s(waitingThread);
    }, () => {
        expect(eventA.value).toBe(1);
        expect(requestingThread.isCompleted).toBeTruthy();
        expect(askingThread.isCompleted).toBeTruthy();
        expect(waitingThread.isCompleted).toBeTruthy();
    });
});



test("a request function parameter is the previous request value ", () => {
    const eventA = new ScenarioEvent<number>('A');

    const requestingThread = new Scenario('thread1', function*() {
        yield bp.request(eventA, 1);
        yield bp.request(eventA, (a) => (a || 0) + 1);
    });

    testScenarios((s, e) => {
        e(eventA);
        s(requestingThread);
    }, () => {
        expect(eventA.value).toBe(2);
        expect(requestingThread.isCompleted).toBeTruthy();
    });
});

test("a bid can be wrapped in a utility function hat will return the typed value", () => {
    const eventA = new ScenarioEvent<number>('A');

    const requestingThread = new Scenario('thread1', function*() {
        const value = yield* bp.bid(bp.request(eventA, 1));
        expect(value).toBe(1);
    });

    testScenarios((s, e) => {
        e(eventA);
        s(requestingThread);
    }, () => {
        expect(requestingThread.isCompleted).toBeTruthy();
    });
});

test("waits will return the value that has been requested", () => {
    const eventA = new ScenarioEvent<number>('A');

    const requestThread = new Scenario('requestThread', function* () {
        yield bp.request(eventA, 1000);
    });

    const receiveThread = new Scenario('receiveThread', function* () {
        const progress = yield bp.waitFor(eventA);
        expect(progress.event).toBe(eventA);
        expect(progress.event.value).toBe(1000);
    });

    testScenarios((s, e) => {
        e(eventA);
        s(requestThread);
        s(receiveThread);
    });
});


test("multiple requests will return information about the progressed Scenario", () => {
    const eventA = new ScenarioEvent<number>('A');
    const eventB = new ScenarioEvent<number>('B');

    const requestThread = new Scenario('request', function* () {
        const progress = yield [bp.request(eventB, 2000), bp.request(eventA, 1000)];
        expect(progress.event).toBe(eventB);
        expect(progress.remainingBids?.length).toEqual(1);
        expect(progress.remainingBids?.[0]?.eventId.name).toBe(eventA.id.name)
    });

    const receiveThreadB = new Scenario('receive', function* () {
        const progress = yield bp.askFor(eventA);
        expect(progress.event).toBe(eventB);
    });

    testScenarios((s, e) => {
        e(eventA, eventB);
        s(requestThread);
        s(receiveThreadB);
    });
});


test("multiple bids at the same time will be expressed as an array.", () => {
    const testEvent = {
        A: new ScenarioEvent<number>('A'),
        B: new ScenarioEvent<number>('B')
    }

    const requestThread = new Scenario('thread1', function* () {
        yield bp.request(testEvent.A, 1000);
    });

    const receiveThread = new Scenario('thread1', function* () {
        const progress = yield [bp.askFor(testEvent.A), bp.askFor(testEvent.B)];
        expect(testEvent.A.value).toBe(1000);
        expect(progress.event).toBe(testEvent.A);
    });

    testScenarios((s, e) => {
        e(testEvent.A, testEvent.B);
        s(requestThread);
        s(receiveThread);
    });
});


test("A request-value can be a function. It will get called, when the event is selected", () => {
    const testEvent = {
        A: new ScenarioEvent<number>('A'),
        B: new ScenarioEvent<number>('B')
    }

    const requestThread = new Scenario('thread1', function* () {
        yield bp.request(testEvent.A, () => 1000);
    })

    const receiveThread = new Scenario('thread1', function* () {
        const progress = yield [bp.askFor(testEvent.A), bp.askFor(testEvent.B)];
        expect(testEvent.A.value).toBe(1000);
        expect(progress.event).toBe(testEvent.A);
    })

    testScenarios((enable, enableEvents) => {
        enableEvents(testEvent.A, testEvent.B);
        enable(requestThread);
        enable(receiveThread);
    });
});


test("A request-value can be a function. It will get called, when the event is selected", () => {
    const testEvent = {
        A: new ScenarioEvent<number>('A'),
        B: new ScenarioEvent<number>('B')
    }

    const requestThread = new Scenario('thread1', function* () {
        yield bp.request(testEvent.A, () => 1000);
    })

    const receiveThread = new Scenario('thread1', function* () {
        const progress = yield [bp.askFor(testEvent.A), bp.askFor(testEvent.B)];
        expect(testEvent.A.value).toBe(1000);
        expect(progress.event).toBe(testEvent.A);
    })

    testScenarios((enable, enableEvents) => {
        enableEvents(testEvent.A, testEvent.B);
        enable(requestThread);
        enable(receiveThread);
    });
});


test("if a request value is a function, it will be called once.", () => {
    const testEvent = {
        A: new ScenarioEvent<number>('A'),
    }

    let fnCount = 0;

    const requestThread = new Scenario('thread1', function* () {
        yield bp.request(testEvent.A, () => {
            fnCount++;
            return 1000;
        });
    });

    const receiveThread1 = new Scenario("receiveThread1", function* () {
        yield bp.askFor(testEvent.A);
    });

    const receiveThread2 = new Scenario("receiveThread2", function* () {
        yield bp.askFor(testEvent.A);
    })

    testScenarios((enable, enableEvents) => {
        enableEvents(testEvent.A);
        enable(requestThread);
        enable(receiveThread1);
        enable(receiveThread2);
    }, () => {
        expect(fnCount).toBe(1);
        expect(receiveThread1.isCompleted).toBeTruthy();
        expect(receiveThread2.isCompleted).toBeTruthy();
    });
});

test("When there are multiple requests with the same event-name, the request with the higher priority will get selected first", () => {
    const testEvent = {
        A: new ScenarioEvent<number>('A')
    }

    const requestThreadLower = new Scenario('thread1', function* () {
        yield bp.request(testEvent.A, 1);
    });

    const requestThreadHigher = new Scenario('thread1', function* () {
        yield bp.request(testEvent.A, 2);
    });

    const receiveThread = new Scenario('thread1', function* () {
        const value = yield* bp.bid(bp.waitFor(testEvent.A));
        expect(value).toBe(2);
    })

    testScenarios((enable, enableEvent) => {
        enableEvent(testEvent.A);
        enable(requestThreadLower); // Lower priority, because it will enabled first.
        enable(requestThreadHigher); // this thread has a higher priority, because it gets enabled later than the first one.
        enable(receiveThread);
    }, () => {
        expect(requestThreadHigher.isCompleted).toBe(true);
        expect(requestThreadLower.isCompleted).toBe(true);
    });
});


// // BLOCK
// //-------------------------------------------------------------------------

test("events can be blocked", () => {
    const testEvent = {
        A: new ScenarioEvent<number>('A'),
    }

    let advancedRequest = false,
        advancedWait = false;

    const requestThread = new Scenario('thread1', function* () {
        yield bp.request(testEvent.A);
        advancedRequest = true;
    });

    const waitingThread = new Scenario('thread1', function* () {
        yield bp.askFor(testEvent.A);
        advancedWait = true;
    });

    const blockingThread = new Scenario('thread2', function* () {
        yield bp.block(testEvent.A);
    });

    testScenarios((enable, enableEvents) => {
        enableEvents(testEvent.A);
        enable(requestThread);
        enable(waitingThread);
        enable(blockingThread);
    }, () => {
        expect(advancedRequest).toBeFalsy();
        expect(advancedWait).toBeFalsy();
        expect(testEvent.A.isBlocked).toBeTruthy();
    });
});


test("if an async request gets blocked, it will not call the updatePayloadCb", () => {
    let calledFunction = false;

    const eventA = new ScenarioEvent('A');

    const requestingThread = new Scenario('thread1', function* () {
        yield bp.request(eventA, () => { calledFunction = true; });
    })

    const blockingThread = new Scenario('thread2', function* () {
        yield bp.block(eventA);
    })

    testScenarios((enable, enableEvents) => {
        enableEvents(eventA);
        enable(requestingThread);
        enable(blockingThread);
    });
    expect(calledFunction).toBe(false);
});


test("an event can be disabled in the staging-function", () => {

    let progressedRequestThread = false;

    const eventA = new ScenarioEvent('A');

    const requestingThread = new Scenario('thread1', function* () {
        yield bp.request(eventA);
        progressedRequestThread = true;
    })

    testScenarios((enable, enableEvents) => {
        enableEvents(eventA)
        eventA.disable();
        enable(requestingThread);
    });
    expect(progressedRequestThread).toBe(false);
});


test("if a thread has multiple requests, the last request has the highest priority.", () => {

    const eventA = new ScenarioEventKeyed('A');

    const requestingThread = new Scenario('thread1', function*() {
        const progress = yield [bp.request(eventA.key(1)), bp.request(eventA.key(2)), bp.request(eventA.key(3)), bp.request(eventA.key(4))];
        expect(progress.event).toEqual(eventA.key(1));
        expect(progress.eventId.key).toEqual(1);
    });

    testScenarios((enable, events) => {
        events(...eventA.keys(1,2,3,4))
        enable(requestingThread);
    });
});

test("with multiple requests for the same eventId, highest priority request is selected - that is also valid", () => {
    let lowerPrioRequestProgressed = false;
    let higherPrioRequestProgressed = false;

    const eventA = new ScenarioEvent<number>('A');

    const requestingThread0 = new Scenario('thread1', function*() {
        const progress = yield bp.request(eventA, 1);
        lowerPrioRequestProgressed = true;
        expect(progress.event.value).toBe(1);
    });

    const requestingThread1 = new Scenario('thread2', function*() {
        const progress = yield bp.request(eventA, 5);
        higherPrioRequestProgressed = true;
        expect(progress.event.value).toBe(5);
    });

    const validatingThread = new Scenario('thread4', function*() {
        yield bp.validate(eventA, (nr) => !!nr && nr < 4);
    });

    testScenarios((enable, event) => {
        event(eventA)
        enable(requestingThread0);
        enable(requestingThread1);
        enable(validatingThread);
    }, () => {
        expect(lowerPrioRequestProgressed).toBe(true);
        expect(higherPrioRequestProgressed).toBe(false);
    });
});

test("with multiple askFor for the same eventId, all askFor bids are progressed", () => {
    let lowerPrioProgressed = false;
    let higherPrioProgressed = false;

    const eventA = new ScenarioEvent<number>('A');

    const askingThreadLow = new Scenario('thread1', function*() {
        yield bp.askFor(eventA);
        lowerPrioProgressed = true;
    });

    const askingThreadHigh = new Scenario('thread2', function*() {
        yield bp.askFor(eventA);
        higherPrioProgressed = true;
    });

    const requestingThread = new Scenario('thread3', function*() {
        yield bp.trigger(eventA, 1);
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(askingThreadLow);
        enable(askingThreadHigh);
        enable(requestingThread);
    }, () => {
        expect(lowerPrioProgressed).toBe(true);
        expect(higherPrioProgressed).toBe(true);

    });
});

test("with multiple askFor for the same eventId, highest priority request is selected - that is also valid", () => {
    let lowerPrioProgressed = false;
    let higherPrioProgressed = false;

    const eventA = new ScenarioEvent<number>('A');

    const askingThreadLow = new Scenario('thread1', function*() {
        yield bp.askFor(eventA, (pl) => !!pl && pl > 10);
        lowerPrioProgressed = true;
    });

    const askingThreadHigh = new Scenario('thread2', function*() {
        yield bp.askFor(eventA, (pl) => !!pl && pl < 10);
        higherPrioProgressed = true;
    });

    const requestingThread = new Scenario('thread3', function*() {
        yield bp.request(eventA, 11);
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(askingThreadLow);
        enable(askingThreadHigh);
        enable(requestingThread);
    }, () => {
        expect(lowerPrioProgressed).toBe(true);
        expect(higherPrioProgressed).toBe(false);

    });
});


test("requesting the same bid multiple times is not allowed and will throw a warning", () => {

    const eventA = new ScenarioEvent<number>('A');

    const requestingThread = new Scenario('thread1', function*() {
        yield [bp.request(eventA), bp.request(eventA)]
    });

    let scenarioContext: BThreadPublicContext;

    testScenarios((enable, events) => {
        events(eventA);
        scenarioContext = enable(requestingThread);
    }, ()=> {
        expect(scenarioContext.isCompleted).toBe(true);
    });
});

test("the allOf utility function will return if all bids have progressed", (done) => {
    let timesPromiseWasCreated = 0;
    const eventA = new ScenarioEvent<number>('A');
    const eventB = new ScenarioEvent<number>('B');


    const requestingThread = new Scenario('thread1',
        function*() {
            yield* bp.allOf(bp.request(eventA, 1), bp.request(eventB, () => {
                timesPromiseWasCreated++;
                return delay(200, 3);
            }));
    });

    testScenarios((enable, events) => {
        events(eventA, eventB);
        enable(requestingThread);
    }, ()=> {
        if(requestingThread.isCompleted) {
            expect(eventB.value).toBe(3);
            expect(eventA.value).toBe(1);
            expect(timesPromiseWasCreated).toBe(1);
            done();
        }
    });
});


test("a pending event is cancelled, if the next bid is not asking for the pending event id", (done) => {
    const eventA = new ScenarioEvent<number>('A');
    const eventB = new ScenarioEvent<number>('B');
    const eventCancel = new ScenarioEvent<number>('Cancel');

    const requestingThread = new Scenario('thread1', function*() {
        yield [bp.request(eventA, 1), bp.request(eventB, () => delay(200, 1))];
        yield bp.request(eventCancel);
    });

    testScenarios((enable, events) => {
        events(eventA, eventB, eventCancel);
        enable(requestingThread);
    }, ()=> {
        if(requestingThread.isCompleted) {
            expect(eventB.isPending).toBe(false);
            done();
        }
    });
});


test("a pending event is cancelled, if the thread completes", (done) => {
    const eventA = new ScenarioEvent<number>('A');
    const eventB = new ScenarioEvent<number>('B');

    const requestingThread = new Scenario('thread1', function*() {
        yield [bp.request(eventA, 1), bp.request(eventB, () => delay(200, 1))];
    })

    testScenarios((enable, events) => {
        events(eventA, eventB);
        enable(requestingThread);
    }, ()=> {
        if(requestingThread.isCompleted) {
            expect(eventB.isPending).toBe(false);
            done();
        }
    });
});


test("a pending event will not remain pending if the next bids will not include the pending event.", (done) => {
    const eventA = new ScenarioEvent<number>('A');
    const eventB = new ScenarioEvent<number>('B');
    const eventContinue = new ScenarioEvent<number>('Continue');

    const requestingThread = new Scenario('thread1', function*() {
        yield [bp.request(eventA, 1), bp.request(eventB, () => delay(500, 1))];
        yield [bp.request(eventB), bp.request(eventContinue)];
        yield bp.askFor(eventContinue);
    })

    testScenarios((enable, events) => {
        events(eventA, eventB, eventContinue)
        enable(requestingThread);
    }, ()=> {
        if(eventContinue.validate()?.isValid) {
            expect(eventB.isPending).toBe(false);
            done();
        }
    });
});


test("askFor will enable events to be dispatched", (done) => {
    const eventA = new ScenarioEvent<number>('A');

    const askingThread = new Scenario('thread1', function*() {
        yield bp.askFor(eventA);
        expect(eventA.value).toBe(11);
    })

    testScenarios((enable, events) => {
        events(eventA);
        enable(askingThread);
    }, ()=> {
        if(!askingThread.isCompleted) {
            eventA.dispatch(11);
        } else {
            done();
        }
    });
});

test("a trigger needs an askFor bid", () => {
    const eventA = new ScenarioEvent('A');
    const eventB = new ScenarioEvent('B');

    const askingThread = new Scenario('askingThread', function*() {
        yield bp.askFor(eventA);
    });

    const triggerThread = new Scenario('trigger', function*() {
        yield bp.trigger(eventA);
    });

    testScenarios((s, e) => {
        e(eventA, eventB);
        s(askingThread);
        s(triggerThread);
    }, () => {
        expect(askingThread.isCompleted).toBe(true);
        expect(triggerThread.isCompleted).toBe(true);
    });
});

test("a trigger will not advance without an askFor bid", () => {
    const eventA = new ScenarioEvent('Abc');

    const requestingThread = new Scenario('requestingThread', function*() {
        yield bp.request(eventA);
    });

    const triggerThread = new Scenario('triggerThread', function*() {
        yield bp.trigger(eventA);
    });

    testScenarios((s, e) => {
        e(eventA);
        s(requestingThread);
        s(triggerThread);
    }, () => {
        expect(triggerThread.isCompleted).toBe(false);
        expect(requestingThread.isCompleted).toBe(true);
    });
});
