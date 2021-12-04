import { BThread } from "../src";
import * as bp from "../src/bid";
import { BEvent, BUIEvent, BEventKeyed } from "../src/b-event";
import { delay, testScenarios } from "./testutils";

// REQUESTS & WAITS
//-------------------------------------------------------------------------
test("a requested event that is not blocked will advance", () => {
    interface TestProps {
        a: number
    }

    const basicEvent = {
        eventA: new BEvent<number>('A'),
        eventB: new BEvent<number>('B')
    }

    const requestingThread = new BThread<TestProps>('thread1', function*(context) {
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
    const eventA = new BEvent<number>('A');

    const requestingThread = new BThread('thread1', function*() {
        yield bp.request(eventA, 1);
    });

    const askingThread = new BThread('askingThread', function*() {
        yield bp.askFor(eventA);
    });

    const waitingThread = new BThread('waitingThread', function*() {
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
        expect(askingThread.isCompleted).toBeFalsy();
        expect(waitingThread.isCompleted).toBeTruthy();
    });
});



// test("a request function parameter is the previous request value ", () => {
//     const eventA = new BEvent<number>('A');
//     const eventB = new BEvent<number>('B');


//     const requestingThread = new BThread('thread1', function*() {
//         yield bp.request(eventA, 1);
//         yield [bp.request(eventB, () => delay(200, 1)), bp.request(eventA, (() => {
//             console.log('test123', x);
//             return 3;
//         }];
//     });

//     testScenarios((s, e) => {
//         e(eventA);
//         s(requestingThread);
//     }, () => {
//         expect(eventA.value).toBe(2);
//         expect(requestingThread.isCompleted).toBeTruthy();
//     });
// });

test("a bid can be wrapped in a utility function hat will return the typed value", () => {
    const eventA = new BEvent<number>('A');

    const requestingThread = new BThread('thread1', function*() {
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
    const eventA = new BEvent<number>('A');

    const requestThread = new BThread('requestThread', function* () {
        yield bp.request(eventA, 1000);
    });

    const receiveThread = new BThread('receiveThread', function* () {
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
    const eventA = new BEvent<number>('A');
    const eventB = new BEvent<number>('B');

    const requestThread = new BThread('request', function* () {
        const progress = yield [bp.request(eventB, 2000), bp.request(eventA, 1000)];
        expect(progress.event).toBe(eventB);
        expect(progress.remainingBids?.length).toEqual(1);
        expect(progress.remainingBids?.[0]?.eventId.name).toBe(eventA.id.name)
    });

    const receiveThreadB = new BThread('receive', function* () {
        const progress = yield [bp.waitFor(eventA), bp.waitFor(eventB)];
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
        A: new BEvent<number>('A'),
        B: new BEvent<number>('B')
    }

    const requestThread = new BThread('thread1', function* () {
        yield bp.request(testEvent.A, 1000);
    });

    const receiveThread = new BThread('thread1', function* () {
        const progress = yield [bp.waitFor(testEvent.A), bp.waitFor(testEvent.B)];
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
        A: new BEvent<number>('A'),
        B: new BEvent<number>('B')
    }

    const requestThread = new BThread('thread1', function* () {
        yield bp.request(testEvent.A, () => 1000);
    })

    const receiveThread = new BThread('thread1', function* () {
        const progress = yield [bp.waitFor(testEvent.A), bp.waitFor(testEvent.B)];
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
        A: new BEvent<number>('A'),
        B: new BEvent<number>('B')
    }

    const requestThread = new BThread('thread1', function* () {
        yield bp.request(testEvent.A, () => 1000);
    })

    const receiveThread = new BThread('thread1', function* () {
        const progress = yield [bp.waitFor(testEvent.A), bp.waitFor(testEvent.B)];
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
        A: new BEvent<number>('A'),
    }

    let fnCount = 0;

    const requestThread = new BThread('thread1', function* () {
        yield bp.request(testEvent.A, () => {
            fnCount++;
            return 1000;
        });
    });

    const receiveThread1 = new BThread("receiveThread1", function* () {
        yield bp.waitFor(testEvent.A);
    });

    const receiveThread2 = new BThread("receiveThread2", function* () {
        yield bp.waitFor(testEvent.A);
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

test("When there are multiple requests with the same event-name, all requests will get the payload from the highest priority request", () => {
    const testEvent = {
        A: new BEvent<number>('A')
    }

    const requestThreadLower = new BThread('thread1', function* () {
        yield bp.request(testEvent.A, 1);
    });

    const requestThreadHigher = new BThread('thread2', function* () {
        yield bp.request(testEvent.A, 2);
    });

    const receiveThread = new BThread('thread3', function* () {
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
        A: new BEvent<number>('A'),
    }

    let advancedRequest = false,
        advancedWait = false;

    const requestThread = new BThread('thread1', function* () {
        yield bp.request(testEvent.A, 13);
        advancedRequest = true;
    });

    const waitingThread = new BThread('thread1', function* () {
        yield bp.waitFor(testEvent.A);
        advancedWait = true;
    });

    const blockingThread = new BThread('thread2', function* () {
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
        expect(testEvent.A.isValid(1)).toBe(false);
    });
});


test("if an async request gets blocked, it will not call the updatePayloadCb", () => {
    let calledFunction = false;

    const eventA = new BEvent('A');

    const requestingThread = new BThread('thread1', function* () {
        yield bp.request(eventA, () => { calledFunction = true; });
    })

    const blockingThread = new BThread('thread2', function* () {
        yield bp.block(eventA);
    })

    testScenarios((enable, enableEvents) => {
        enableEvents(eventA);
        enable(requestingThread);
        enable(blockingThread);
    });
    expect(calledFunction).toBe(false);
});

test("if a thread has multiple requests, the last request has the highest priority.", () => {

    const eventA = new BEventKeyed('A');

    const requestingThread = new BThread('thread1', function*() {
        const progress = yield [bp.request(eventA.key(1)), bp.request(eventA.key(2)), bp.request(eventA.key(3)), bp.request(eventA.key(4))];
        expect(progress.event).toEqual(eventA.key(1));
        expect(progress.eventId.key).toEqual(1);
    });

    testScenarios((enable, events) => {
        events(...eventA.keys(1,2,3,4))
        enable(requestingThread);
    });
});

test("with multiple requests for the same event, all requests-validation need to pass, for the request to be selected", () => {
    const eventA = new BEvent<number>('A');

    const requestingLow = new BThread('thread1', function*() {
        const progressInfo = yield bp.request(eventA, 1);
        expect(progressInfo.event.value).toBe(2);
    });

    const requestingHigh = new BThread('thread2', function*() {
        yield bp.request(eventA, 2);
    });

    const requestingInvalid = new BThread('thread3', function*() {
        yield bp.request(eventA, 100);
    });

    const validating = new BThread('thread4', function*() {
        yield bp.validate(eventA, (nr) => !!nr && nr < 4);
    });

    const waiting = new BThread('thread5', function*() {
        const value = yield* bp.bid(bp.waitFor(eventA));
        expect(value).toBe(2);
    });

    testScenarios((enable, event) => {
        event(eventA)
        enable(requestingLow);
        enable(requestingHigh);
        enable(requestingInvalid);
        enable(validating);
        enable(waiting);
    }, () => {
        expect(requestingHigh.isCompleted).toBe(false);
        expect(requestingInvalid.isCompleted).toBe(false);
        expect(validating.isCompleted).toBe(false);
        expect(requestingLow.isCompleted).toBe(false);
        expect(waiting.isCompleted).toBe(false);
    });
});

test("with multiple askFor for the same eventId, all askFor bids are progressed", () => {
    let lowerPrioProgressed = false;
    let higherPrioProgressed = false;

    const eventA = new BEvent<number>('A');

    const askingThreadLow = new BThread('thread1', function*() {
        yield bp.askFor(eventA);
        lowerPrioProgressed = true;
    });

    const askingThreadHigh = new BThread('thread2', function*() {
        yield bp.askFor(eventA);
        higherPrioProgressed = true;
    });

    const triggerThread = new BThread('thread3', function*() {
        yield bp.trigger(eventA, 1);
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(askingThreadLow);
        enable(askingThreadHigh);
        enable(triggerThread);
    }, () => {
        expect(higherPrioProgressed).toBe(true);
        expect(lowerPrioProgressed).toBe(true);
    });
});

// test("with multiple askFor for the same eventId, the high prio askFor is relevant", () => {
//     let lowerPrioProgressed = false;
//     let higherPrioProgressed = false;

//     const eventA = new BEvent<number>('A');

//     const askingThreadLow = new BThread('thread1', function*() {
//         yield bp.askFor(eventA, (pl) => !!pl && pl > 10);
//         lowerPrioProgressed = true;
//     });

//     const askingThreadHigh = new BThread('thread2', function*() {
//         yield bp.askFor(eventA, (pl) => !!pl && pl < 10);
//         higherPrioProgressed = true;
//     });

//     const requestingThread = new BThread('thread3', function*() {
//         yield bp.trigger(eventA, 11);
//     });

//     testScenarios((enable, events) => {
//         events(eventA);
//         enable(askingThreadLow);
//         enable(askingThreadHigh);
//         enable(requestingThread);
//     }, () => {
//         expect(lowerPrioProgressed).toBe(false);
//         expect(higherPrioProgressed).toBe(false);

//     });
// });


test("a BThread can return the state of completion", () => {

    const eventA = new BEvent<number>('A');

    const requestingThread = new BThread('thread1', function*() {
        yield [bp.request(eventA), bp.request(eventA)]
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(requestingThread);
    }, ()=> {
        expect(requestingThread.isCompleted).toBe(true);
    });
});

// test("the allOf utility function will return if all bids have progressed", (done) => {
//     let timesPromiseWasCreated = 0;
//     const eventA = new BEvent<number>('A');
//     const eventB = new BEvent<number>('B');


//     const requestingThread = new BThread('thread1',
//         function*() {
//             yield* bp.allOf(bp.request(eventA, 1), bp.request(eventB, () => {
//                 timesPromiseWasCreated++;
//                 return delay(200, 3);
//             }));
//     });

//     testScenarios((enable, events) => {
//         events(eventA, eventB);
//         enable(requestingThread);
//     }, ()=> {
//         if(requestingThread.isCompleted) {
//             expect(eventB.value).toBe(3);
//             expect(eventA.value).toBe(1);
//             expect(timesPromiseWasCreated).toBe(1);
//             done();
//         }
//     });
// });


test("a pending event is canceled, when another request finished before", (done) => {
    const eventA = new BEvent<number>('A');
    const eventB = new BEvent<number>('B');

    const requestingThread = new BThread('thread1', function*() {
        yield [bp.request(eventB, () => delay(2000, 1)), bp.request(eventA, 1)];
    });

    testScenarios((enable, events) => {
        events(eventA, eventB);
        enable(requestingThread);
    }, ()=> {
        if(requestingThread.isCompleted) {
            expect(eventA.value).toBe(1);
            expect(eventB.value).toBe(undefined);
            expect(eventB.isPending).toBe(false);
            done();
        }
    });
});





test("askFor will enable events to be dispatched", (done) => {
    const eventA = new BEvent<number>('A');

    const askingThread = new BThread('thread1', function*() {
        yield bp.askFor(eventA);
        expect(eventA.value).toBe(11);
    })

    testScenarios((enable, events) => {
        events(eventA);
        enable(askingThread);
    }, ()=> {
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
    const eventA = new BEvent('Axxx');

    const askingThread = new BThread('askingThread', function*() {
        yield bp.askFor(eventA);
    });

    const triggerThread = new BThread('trigger', function*() {
        yield bp.trigger(eventA);
    });

    testScenarios((s, e) => {
        e(eventA);
        s(askingThread);
        s(triggerThread);
    }, () => {
        expect(triggerThread.isCompleted).toBe(true);
        expect(askingThread.isCompleted).toBe(true);
    });
});

test("a trigger will not advance without an askFor bid", () => {
    const eventA = new BEvent('Abc');

    const waitingBThread = new BThread('requestingThread', function*() {
        yield bp.waitFor(eventA);
    });

    const triggerThread = new BThread('triggerThread', function*() {
        yield bp.trigger(eventA);
    });

    testScenarios((s, e) => {
        e(eventA);
        s(waitingBThread);
        s(triggerThread);
    }, () => {
        expect(triggerThread.isCompleted).toBe(false);
        expect(waitingBThread.isCompleted).toBe(false);
    });
});
