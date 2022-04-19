import { Flow } from "../src/flow";
import * as bp from "../src/bid";
import { delay, testScenarios } from "./testutils";
import { FlowEvent, FlowEventKeyed, UserEvent } from "../src";

test("throw an error if two different flows with the same ID are enabled", () => {
    const basicEvent = {
        eventA: new FlowEvent<number>('A')
    }

    const first = new Flow('thread1', function*() {
        yield bp.request(basicEvent.eventA, 1);
    });
    const second = new Flow('thread1', function*() {
        yield bp.request(basicEvent.eventA, 2);
    });

    const updateCB = ()=> {const x = 1;};

    try {
        expect(
            testScenarios((s) => {
                s(first);
                s(second);
            }, [basicEvent.eventA], updateCB)).toThrow('[Error: thread1 enabled more than once]')
    } catch(e) {
        const X = e;
    }
});

// REQUESTS & WAITS
//-------------------------------------------------------------------------
test("a requested event that is not blocked will advance", () => {


    const basicEvent = {
        eventA: new FlowEvent<number>('A'),
        eventB: new FlowEvent<number>('B')
    }

    const requestingThread = new Flow('thread1', function*() {
        const progress = yield bp.request(basicEvent.eventA, 1);
        expect(progress.event).toBe(basicEvent.eventA);
        expect(this.key).toBe(undefined);
    });

    testScenarios((s) => {
        s(requestingThread);
    }, [basicEvent.eventA, basicEvent.eventB], ()=> {
        expect(requestingThread.isCompleted).toBe(true);
    });
});

test("If two flows are requesting at the same time, each request will be advanced separately", () => {
    const basicEvent = {
        eventA: new FlowEvent<number>('A', 0)
    }

    const requestingFlow = new Flow('requestingFlow', function*() {
            yield bp.request(basicEvent.eventA, 1);
            expect(basicEvent.eventA.value).toBe(1);
    });

    const waitingFlow = new Flow('waitingFlow', function*() {
        yield [bp.waitFor(basicEvent.eventA), bp.request(basicEvent.eventA, 2)];
        expect(basicEvent.eventA.value).toBe(2);
        yield bp.waitFor(basicEvent.eventA);
        expect(basicEvent.eventA.value).toBe(1);
    });

    testScenarios((s) => {
        s(requestingFlow);
        s(waitingFlow);
    }, [basicEvent.eventA], ()=> {
        expect(requestingFlow.isCompleted).toBe(true);
        expect(waitingFlow.isCompleted).toBe(true);
        expect(basicEvent.eventA.value).toBe(1)

    });
});


test("a request will also advance waiting Scenarios", () => {
    const eventA = new FlowEvent<number>('A');

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventA, 1);
    });

    const waitingThread = new Flow('waitingThread', function*() {
        yield bp.waitFor(eventA);
    });

    testScenarios((s) => {
        s(requestingThread);
        s(waitingThread);
    }, [eventA], () => {
        expect(eventA.value).toBe(1);
        expect(requestingThread.isCompleted).toBeTruthy();
        expect(waitingThread.isCompleted).toBeTruthy();
    });
});

test("a bid can be wrapped in a utility function hat will return the typed value", () => {
    const eventA = new FlowEvent<number>('A');

    const requestingThread = new Flow('thread1', function*() {
        const value = yield* bp.bid(bp.request(eventA, 1));
        expect(value).toBe(1);
    });

    testScenarios((s) => {
        s(requestingThread);
    }, eventA, () => {
        expect(requestingThread.isCompleted).toBeTruthy();
    });
});

test("waits will return the value that has been requested", () => {
    const eventA = new FlowEvent<number>('A');

    const requestThread = new Flow('requestThread', function* () {
        yield bp.request(eventA, 1000);
    });

    const receiveThread = new Flow('receiveThread', function* () {
        const progress = yield bp.waitFor(eventA);
        expect(progress.event).toBe(eventA);
        expect(progress.event.value).toBe(1000);
    });

    testScenarios((s) => {
        s(requestThread);
        s(receiveThread);
    }, eventA);
});


test("multiple requests will return information about the progressed Scenario", () => {
    const eventA = new FlowEvent<number>('A');
    const eventB = new FlowEvent<number>('B');

    const requestThread = new Flow('request', function* () {
        const progress = yield [bp.request(eventB, 2000), bp.request(eventA, 1000)];
        expect(progress.event).toBe(eventB);
        expect(progress.remainingBids?.length).toEqual(1);
        expect(progress.remainingBids?.[0]?.eventId.name).toBe(eventA.id.name)
    });

    const receiveThreadB = new Flow('receive', function* () {
        const progress = yield [bp.waitFor(eventA), bp.waitFor(eventB)];
        expect(progress.event).toBe(eventB);
    });

    testScenarios((s) => {
        s(requestThread);
        s(receiveThreadB);
    }, [eventA, eventB]);
});


test("multiple bids at the same time will be expressed as an array.", () => {
    const testEvent = {
        A: new FlowEvent<number>('A'),
        B: new FlowEvent<number>('B')
    }

    const requestThread = new Flow('thread1', function* () {
        yield bp.request(testEvent.A, 1000);
    });

    const receiveThread = new Flow('thread2', function* () {
        const progress = yield [bp.waitFor(testEvent.A), bp.waitFor(testEvent.B)];
        expect(testEvent.A.value).toBe(1000);
        expect(progress.event).toBe(testEvent.A);
    });

    testScenarios((s) => {
        s(requestThread);
        s(receiveThread);
    }, testEvent);
});


test("A request-value can be a function. It will get called, when the event is selected", () => {
    const testEvent = {
        A: new FlowEvent<number>('A'),
        B: new FlowEvent<number>('B')
    }

    const requestThread = new Flow('thread1', function* () {
        yield bp.request(testEvent.A, () => 1000);
    })

    const receiveThread = new Flow('thread2', function* () {
        const progress = yield [bp.waitFor(testEvent.A), bp.waitFor(testEvent.B)];
        expect(testEvent.A.value).toBe(1000);
        expect(progress.event).toBe(testEvent.A);
    })

    testScenarios((enable) => {
        enable(requestThread);
        enable(receiveThread);
    }, testEvent);
});


test("A request-value can be a function. It will get called, when the event is selected", () => {
    const testEvent = {
        A: new FlowEvent<number>('A'),
        B: new FlowEvent<number>('B')
    }

    const requestThread = new Flow('thread1', function* () {
        yield bp.request(testEvent.A, () => 1000);
    })

    const receiveThread = new Flow('thread2', function* () {
        const progress = yield [bp.waitFor(testEvent.A), bp.waitFor(testEvent.B)];
        expect(testEvent.A.value).toBe(1000);
        expect(progress.event).toBe(testEvent.A);
    })

    testScenarios((enable) => {
        enable(requestThread);
        enable(receiveThread);
    }, testEvent);
});


test("if a request value is a function, it will be called once.", () => {
    const testEvent = {
        A: new FlowEvent<number>('A'),
    }

    let fnCount = 0;

    const requestThread = new Flow('thread1', function* () {
        yield bp.request(testEvent.A, () => {
            fnCount++;
            return 1000;
        });
    });

    const receiveThread1 = new Flow("receiveThread1", function* () {
        yield bp.waitFor(testEvent.A);
    });

    const receiveThread2 = new Flow("receiveThread2", function* () {
        yield bp.waitFor(testEvent.A);
    })

    testScenarios((enable) => {
        enable(requestThread);
        enable(receiveThread1);
        enable(receiveThread2);
    }, testEvent, () => {
        expect(fnCount).toBe(1);
        expect(receiveThread1.isCompleted).toBeTruthy();
        expect(receiveThread2.isCompleted).toBeTruthy();
    });
});


test("When there are multiple requests with the same event-name, all requests will fire an event", () => {
    const testEvent = {
        A: new FlowEvent<number>('A')
    }

    const requestThreadLower = new Flow('thread1', function* () {
        yield bp.request(testEvent.A, 1);
    });

    const requestThreadHigher = new Flow('thread2', function* () {
        yield bp.request(testEvent.A, 2);
    });

    const receiveThread = new Flow('thread3', function* () {
        let value = yield* bp.bid(bp.waitFor(testEvent.A));
        expect(value).toBe(2);
        value = yield* bp.bid(bp.waitFor(testEvent.A));
        expect(value).toBe(1);
    })

    testScenarios(enable => {
        enable(requestThreadLower); // Lower priority, because it will enabled first.
        enable(requestThreadHigher); // this thread has a higher priority, because it gets enabled later than the first one.
        enable(receiveThread);
    }, testEvent.A, () => {
        expect(requestThreadHigher.isCompleted).toBe(true);
        expect(requestThreadLower.isCompleted).toBe(true);
        expect(receiveThread.isCompleted).toBe(true);
    });
});


// // // BLOCK
// // //-------------------------------------------------------------------------

test("events can be blocked", () => {
    const testEvent = {
        A: new FlowEvent<number>('A'),
    }

    let advancedRequest = false,
        advancedWait = false;

    const requestThread = new Flow('thread1', function* () {
        yield bp.request(testEvent.A, 13);
        advancedRequest = true;
    });

    const waitingThread = new Flow('thread2', function* () {
        yield bp.waitFor(testEvent.A);
        advancedWait = true;
    });

    const blockingThread = new Flow('thread3', function* () {
        yield bp.validate(testEvent.A, () => false);
    });

    testScenarios((enable) => {
        enable(requestThread);
        enable(waitingThread);
        enable(blockingThread);
    }, testEvent, () => {
        expect(advancedRequest).toBeFalsy();
        expect(advancedWait).toBeFalsy();
    });
});


test("if request gets validated, the request-Function payload is used", () => {

    const eventA = new FlowEvent<number>('A');

    const requestingThread = new Flow('thread1', function* () {
        yield bp.request(eventA, () => 1);
    })

    const validateThread = new Flow('thread2', function* () {
        yield bp.validate(eventA, (x) => {
            expect(x).toBe(1);
            return true;
        });
    });

    testScenarios((enable) => {
        enable(requestingThread);
        enable(validateThread);
    }, eventA);
    expect(eventA.value).toBe(1);
});

test("if a thread has multiple requests, the last request has the highest priority.", () => {

    const eventA = new FlowEventKeyed('A');

    const requestingThread = new Flow('thread1', function*() {
        const progress = yield [bp.request(eventA.key(1)), bp.request(eventA.key(2)), bp.request(eventA.key(3)), bp.request(eventA.key(4))];
        expect(progress.event).toEqual(eventA.key(1));
        expect(progress.eventId.key).toEqual(1);
    });

    testScenarios((enable) => {
        enable(requestingThread);
    }, eventA.keys(1,2,3,4));
});

test("with multiple requests for the same event, all requests-validation need to pass, for the request to be selected", () => {
    const eventA = new FlowEvent<number>('A');

    const requestingLow = new Flow('thread1', function*() {
        const progressInfo = yield bp.request(eventA, 1);
        expect(progressInfo.event.value).toBe(2);
    });

    const requestingHigh = new Flow('thread2', function*() {
        yield bp.request(eventA, 2);
    });

    const requestingInvalid = new Flow('thread3', function*() {
        yield bp.request(eventA, 100);
    });

    const validating = new Flow('thread4', function*() {
        yield bp.validate(eventA, (nr) => !!nr && nr < 4);
    });

    const waiting = new Flow('thread5', function*() {
        const value = yield* bp.bid(bp.waitFor(eventA));
        expect(value).toBe(2);
    });

    testScenarios((enable) => {
        enable(requestingLow);
        enable(requestingHigh);
        enable(requestingInvalid);
        enable(validating);
        enable(waiting);
    }, eventA, () => {
        expect(requestingHigh.isCompleted).toBe(false);
        expect(requestingInvalid.isCompleted).toBe(false);
        expect(validating.isCompleted).toBe(false);
        expect(requestingLow.isCompleted).toBe(false);
        expect(waiting.isCompleted).toBe(false);
    });
});

test("with multiple askFor for the same eventId, only the highest priority askFor ist valid", () => {
    let lowerPrioProgressed = false;
    let higherPrioProgressed = false;

    const eventA = new UserEvent<number>('A');

    const askingThreadLow = new Flow('thread1', function*() {
        yield bp.askFor(eventA);
        lowerPrioProgressed = true;
    });

    const askingThreadHigh = new Flow('thread2', function*() {
        yield bp.askFor(eventA);
        higherPrioProgressed = true;
    });

    const triggerThread = new Flow('thread3', function*() {
        yield bp.trigger(eventA, 1);
    });

    testScenarios((enable) => {
        enable(askingThreadLow);
        enable(askingThreadHigh);
        enable(triggerThread);
    }, eventA, () => {
        expect(higherPrioProgressed).toBe(true);
        expect(lowerPrioProgressed).toBe(false);
    });
});


test("a Flow can return the state of completion", () => {

    const eventA = new FlowEvent<number>('A');

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventA, 11);
    });

    const requestingThread2 = new Flow('thread2', function*() {
        yield bp.validate(eventA, x => x > 10)
    });

    testScenarios((enable) => {
        enable(requestingThread);
        enable(requestingThread2);
    }, eventA, ()=> {
        expect(requestingThread.isCompleted).toBe(true);
        expect(requestingThread2.isCompleted).toBe(false);
    });
});


test("the allOf utility function will return if all bids have progressed", (done) => {
    let timesPromiseWasCreated = 0;
    const eventA = new FlowEvent<number>('A');
    const eventB = new FlowEvent<number>('B');


    const requestingThread = new Flow('thread1',
        function*() {
            yield* bp.allOf(bp.request(eventA, 1), bp.request(eventB, () => {
                timesPromiseWasCreated++;
                return delay(200, 3);
            }));
    });

    testScenarios((enable) => {
        enable(requestingThread);
    }, [eventA, eventB], ()=> {
        if(requestingThread.isCompleted) {
            expect(eventB.value).toBe(3);
            expect(eventA.value).toBe(1);
            expect(timesPromiseWasCreated).toBe(1);
            done();
        }
    });
});


test("a pending event is canceled, when another request finished before", (done) => {
    const eventA = new FlowEvent<number | undefined>('A');
    const eventB = new FlowEvent<number | undefined>('B');

    const requestingThread = new Flow('thread1', function*() {
        yield [bp.request(eventB, () => delay(2000, 1)), bp.request(eventA, 1)];
    });

    testScenarios((enable) => {
        enable(requestingThread);
    }, [eventA, eventB], ()=> {
        if(requestingThread.isCompleted) {
            expect(eventA.value).toBe(1);
            expect(eventB.value).toBe(undefined);
            expect(eventB.pendingBy).toBe(undefined);
            done();
        }
    });
});


test("askFor will enable events to be dispatched", (done) => {
    const eventA = new UserEvent<number>('A');

    const askingThread = new Flow('thread1', function*() {
        yield bp.askFor(eventA);
        expect(eventA.value).toBe(11);
    })

    testScenarios((enable) => {
        enable(askingThread);
    }, eventA, ()=> {
        if(!askingThread.isCompleted) {
            eventA.dispatch(11).then(val => {
                expect(val.isValid).toBe(true);
            });
        } else {
            expect(askingThread.isCompleted).toBe(true);
            done();
        }
    });
});

test("a trigger needs an askFor bid", () => {
    const eventA = new UserEvent('A');

    const askingThread = new Flow('askingThread', function*() {
        yield bp.askFor(eventA);
    });

    const triggerThread = new Flow('trigger', function*() {
        yield bp.trigger(eventA);
    });

    testScenarios((s) => {
        s(askingThread);
        s(triggerThread);
    }, eventA, () => {
        expect(triggerThread.isCompleted).toBe(true);
        expect(askingThread.isCompleted).toBe(true);
    });
});

test("a trigger will not advance without an askFor bid", () => {
    const eventA = new UserEvent('Abc');

    const waitingFlow = new Flow('requestingThread', function*() {
        yield bp.waitFor(eventA);
    });

    const triggerThread = new Flow('triggerThread', function*() {
        yield bp.trigger(eventA);
    });

    testScenarios((s) => {
        s(waitingFlow);
        s(triggerThread);
    }, eventA, () => {
        expect(triggerThread.isCompleted).toBe(false);
        expect(waitingFlow.isCompleted).toBe(false);
    });
});

test("a trigger can have a function as payload", () => {
    const eventA = new UserEvent<number>('Abc');

    const askForFlow = new Flow('askForFlow', function*() {
        yield bp.askFor(eventA);
    });

    const triggerFlow = new Flow('triggerFlow', function*() {
        yield bp.trigger(eventA, () => 100);
    });

    testScenarios((s) => {
        s(askForFlow);
        s(triggerFlow);
    }, eventA, () => {
        expect(askForFlow.isCompleted).toBe(true);
        expect(triggerFlow.isCompleted).toBe(true);
        expect(eventA.value).toBe(100);
    });
});

test("waitFor guards are not combined (one waitFor might pass, the other not)", () => {
    const eventA = new FlowEvent<number>('Abc');

    const waitingFlow = new Flow('wait1', function*() {
        yield bp.waitFor(eventA, () => false);
    });

    const waitingFlow2 = new Flow('wait2', function*() {
        yield bp.waitFor(eventA);
    });

    const requestingFlow = new Flow('request', function*() {
        yield bp.request(eventA, 100);
    });

    testScenarios((s) => {
        s(waitingFlow);
        s(waitingFlow2);
        s(requestingFlow)
    }, eventA, () => {
        expect(waitingFlow.isCompleted).toBe(false);
        expect(waitingFlow2.isCompleted).toBe(true);
        expect(requestingFlow.isCompleted).toBe(true);
        expect(eventA.value).toBe(100);
    });
});


test("a blocked askFor event will still be marked as asked for.", () => {
    const eventA = new UserEvent<number>('Abc');

    const waitingFlow = new Flow('waiting', function*() {
        yield bp.askFor(eventA);
    });

    const blockingFlow = new Flow('blocking', function*() {
        yield bp.block(eventA);
    });

    testScenarios((s) => {
        s(waitingFlow);
        s(blockingFlow);
    }, eventA, () => {
        expect(eventA.isAskedFor).toBe(true);
        expect(eventA.isValid(1)).toBe(false);
        expect(eventA.explain(1).invalidReason).toBe('Blocked')
    });
});

// TODO: a request Guard will have no arguments
// TODO: a trigger guard will have no arguments