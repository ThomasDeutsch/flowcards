import * as bp from "../src/bid";
import { delay, testScenarios } from "./testutils";
import { Scenario } from '../src/scenario';
import { ScenarioEvent } from "../src/scenario-event";

// REQUESTS & WAITS
//-------------------------------------------------------------------------
test("a requested event that is not blocked will advance", () => {
    const eventA = new ScenarioEvent<number>('A');

    const requestingThread = new Scenario<Record<string, number>>('thread1', function*(context) {
        const progress = yield bp.request(eventA, 1);
        expect(progress.event).toBe(eventA);
        expect(context.a).toEqual(123);
        expect(this.key).toBe(undefined);
    });

    testScenarios((s, e) => {
        e(eventA);
        s(requestingThread.context({a: 123}));
    }, ()=> {
        expect(requestingThread.isCompleted).toBe(true);
    });
});


// test("a request will also advance waiting Scenarios", () => {
//     const eventA = new ScenarioEvent<number>('A')

//     const requestingThread = new Scenario<undefined, number>('thread1', function*() {
//         const progress = yield bp.request(eventA, 1);
//         this.setValue(progress.payload);
//     });

//     const askingThread = new Scenario('askingThread', function*() {
//         yield bp.askFor(eventA);
//     });

//     const waitingThread = new Scenario('waitingThread', function*() {
//         yield bp.waitFor(eventA);
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread.context());
//         enable(askingThread.context());
//         enable(waitingThread.context());
//     }, () => {
//         expect(requestingThread.value).toBe(1);
//         expect(requestingThread.isCompleted).toBeTruthy();
//         expect(askingThread.isCompleted).toBeTruthy();
//         expect(waitingThread.isCompleted).toBeTruthy();
//     });
// });


// test("waits will return the value that has been requested", () => {
//     const eventA = new ScenarioEvent<number>('A');

//     const requestThread = new Scenario('requestThread', function* () {
//         yield bp.request(eventA, 1000);
//     });

//     const receiveThread = new Scenario('receiveThread', function* () {
//         const progress = yield bp.waitFor(eventA);
//         expect(progress.event).toBe(eventA);
//         expect(progress.payload).toBe(1000);
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(requestThread.context());
//         enable(receiveThread.context());
//     });
// });


// test("multiple requests will return information about the progressed Scenario", () => {
//     const testEvent = {
//         A: new ScenarioEvent<number>('A'),
//         B: new ScenarioEvent<number>('B')
//     }

//     const requestThread = scenario(null, function* () {
//         const progress = yield [bp.request(testEvent.A, 1000), bp.request(testEvent.B, 2000)];
//         expect(progress.event).toBe(testEvent.B);
//         expect(progress.remainingBids?.length).toEqual(1);
//         expect(progress.remainingBids?.[0]?.eventId.name).toBe(testEvent.A.id.name)
//     });

//     const receiveThreadB = scenario(null, function* () {
//         const progress = yield bp.askFor(testEvent.B);
//         expect(progress.event).toBe(testEvent.B);
//     });

//     testScenarios(testEvent, (enable) => {
//         enable(requestThread());
//         enable(receiveThreadB());
//     });
// });


// test("multiple bids at the same time will be expressed as an array.", () => {
//     const testEvent = {
//         A: new ScenarioEvent<number>('A'),
//         B: new ScenarioEvent<number>('B')
//     }

//     const requestThread = scenario(null, function* () {
//         yield bp.request(testEvent.A, 1000);
//     })

//     const receiveThread = scenario(null, function* () {
//         const progress = yield [bp.askFor(testEvent.A), bp.askFor(testEvent.B)];
//         expect(testEvent.A.value).toBe(1000);
//         expect(progress.event).toBe(testEvent.A);
//     })

//     testScenarios(testEvent, (enable) => {
//         enable(requestThread());
//         enable(receiveThread());
//     });
// });


// test("A request-value can be a function. It will get called, when the event is selected", () => {
//     const testEvent = {
//         A: new ScenarioEvent<number>('A'),
//         B: new ScenarioEvent<number>('B')
//     }

//     const requestThread = scenario(null, function* () {
//         yield bp.request(testEvent.A, () => 1000);
//     })

//     const receiveThread = scenario(null, function* () {
//         const progress = yield [bp.askFor(testEvent.A), bp.askFor(testEvent.B)];
//         expect(testEvent.A.value).toBe(1000);
//         expect(progress.event).toBe(testEvent.A);
//     })

//     testScenarios(testEvent, (enable) => {
//         enable(requestThread());
//         enable(receiveThread());
//     });
// });


// test("if a request value is a function, it will be called once.", () => {
//     const testEvent = {
//         A: new ScenarioEvent<number>('A'),
//     }

//     let fnCount = 0;

//     const requestThread = scenario(null, function* () {
//         yield bp.request(testEvent.A, () => {
//             fnCount++;
//             return 1000;
//         });
//     });

//     const receiveThread1 = scenario({id: "receiveThread1"}, function* () {
//         yield bp.askFor(testEvent.A);
//     });

//     const receiveThread2 = scenario({id: "receiveThread2"}, function* () {
//         yield bp.askFor(testEvent.A);
//     })

//     testScenarios(testEvent, (enable) => {
//         enable(requestThread());
//         enable(receiveThread1());
//         enable(receiveThread2());
//     }, ({scenario}) => {
//         expect(fnCount).toBe(1);
//         expect(scenario('receiveThread1')?.isCompleted).toBeTruthy();
//         expect(scenario('receiveThread2')?.isCompleted).toBeTruthy();
//     });
// });

// test("When there are multiple requests with the same event-name, the request with the higher priority will get selected first", () => {
//     const testEvent = {
//         A: new ScenarioEvent<number>('A')
//     }

//     const requestThreadLower = scenario(null, function* () {
//         yield bp.request(testEvent.A, 1);
//     });

//     const requestThreadHigher = scenario(null, function* () {
//         yield bp.request(testEvent.A, 2);
//     });

//     const receiveThread = scenario(null, function* () {
//         const progress = yield bp.waitFor(testEvent.A);
//         expect(progress.event.value).toBe(2);
//     })

//     testScenarios(testEvent, (enable) => {
//         enable(requestThreadLower()); // Lower priority, because it will enabled first.
//         enable(requestThreadHigher()); // this thread has a higher priority, because it gets enabled later than the first one.
//         enable(receiveThread());
//     });
// });


// // BLOCK
// //-------------------------------------------------------------------------

// test("events can be blocked", () => {
//     const testEvent = {
//         A: new ScenarioEvent<number>('A'),
//     }

//     let advancedRequest = false,
//         advancedWait = false;

//     const requestThread = scenario(null, function* () {
//         yield bp.request(testEvent.A);
//         advancedRequest = true;
//     });

//     const waitingThread = scenario(null, function* () {
//         yield bp.askFor(testEvent.A);
//         advancedWait = true;
//     });

//     const blockingThread = scenario(null, function* () {
//         yield bp.block(testEvent.A);
//     });

//     testScenarios(testEvent, (enable) => {
//         enable(requestThread());
//         enable(waitingThread());
//         enable(blockingThread());
//     }, () => {
//         expect(advancedRequest).toBeFalsy();
//         expect(advancedWait).toBeFalsy();
//         expect(testEvent.A.isBlocked).toBeTruthy();
//     });
// });


// test("if an async request gets blocked, it will not call the updatePayloadCb", () => {
//     let calledFunction = false;

//     const eventA = new ScenarioEvent('A');

//     const requestingThread = scenario(null, function* () {
//         yield bp.request(eventA, () => { calledFunction = true; });
//     })

//     const blockingThread = scenario(null, function* () {
//         yield bp.block(eventA);
//     })

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread());
//         enable(blockingThread());
//     });
//     expect(calledFunction).toBe(false);
// });


// test("a requested event with a key is blocked by a block for the same event that has no key", () => {

//     let progressedRequestThread = false;

//     const eventA1 = new ScenarioEvent('A');
//     const eventA = new ScenarioEvent('A');

//     const requestingThread = scenario(null, function* () {
//         yield bp.request(eventA1);
//         progressedRequestThread = true;
//     })

//     const blockingThread = scenario(null, function* () {
//         yield bp.block(eventA);
//     })

//     testScenarios({eventA, eventA1}, (enable) => {
//         enable(requestingThread());
//         enable(blockingThread());
//     });
//     expect(progressedRequestThread).toBe(false);
// });


// test("a requested event with a key is blocked by a block with the same event-name and -key", () => {
//     let progressedRequestThread1 = false;
//     let progressedRequestThread2 = false;

//     const eventA = new ScenarioEvent<number | void>('A');

//     const requestingThread = scenario(null, function* () {
//         yield bp.request(eventA, 5);
//         yield bp.request(eventA.key(1), 10);
//         progressedRequestThread1 = true;
//         yield bp.request(eventA.key(2));
//         progressedRequestThread2 = true;
//     })

//     const blockingThread = scenario(null, function* () {
//         yield bp.block(eventA.key(2));
//     })

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread());
//         enable(blockingThread());
//     });
//     expect(progressedRequestThread1).toBe(true);
//     expect(progressedRequestThread2).toBe(false);
//     expect(eventA.value).toBe(5);
//     expect(eventA.key(1).value).toBe(10);
// });


// test("a keyed waitFor will not advance on the same Event-Name without a Key", () => {
//     let requestProgressed = false, waitProgressed = false;

//     const eventA = new ScenarioEvent('A');

//     const requestingThread = scenario({id: 'thread1'}, function*() {
//         yield bp.request(eventA);
//         requestProgressed = true;
//     });

//     const waitingThread = scenario(null, function*() {
//         yield [bp.waitFor(eventA.key(1)), bp.waitFor(eventA.key(2))];
//         waitProgressed = true;
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread());
//         enable(waitingThread());
//     }, () => {
//         expect(requestProgressed).toBe(true);
//         expect(waitProgressed).toBe(false);
//     });
// });


// test("a wait without a key will react to keyed events with the same name", () => {
//     let requestProgressed: any, waitProgressed: any;

//     const eventA = new ScenarioEvent('A');

//     const requestingThread = scenario({id: 'thread1'}, function*() {
//         yield bp.request(eventA.key(1));
//         requestProgressed = true;
//     });

//     const waitingThread = scenario(null, function*() {
//         yield bp.waitFor(eventA);
//         waitProgressed = true;
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread());
//         enable(waitingThread());
//     }, () => {
//         expect(requestProgressed).toBe(true);
//         expect(waitProgressed).toBe(true);
//     });
// });

// test("if a thread has multiple requests, the last request has the highest priority.", () => {

//     const eventA = new ScenarioEvent('A');

//     const requestingThread = scenario({id: 'thread1'}, function*() {
//         const progress = yield [bp.request(eventA.key(1)), bp.request(eventA.key(2)), bp.request(eventA.key(3)), bp.request(eventA.key(4))];
//         expect(progress.event).toEqual(eventA);
//         expect(progress.eventId.key).toEqual(4);
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread());
//     });
// });


// test("with multiple requests for the same eventId, highest priority request is selected - that is also valid", () => {
//     let lowerPrioRequestProgressed = false;
//     let higherPrioRequestProgressed = false;

//     const eventA = new ScenarioEvent<number>('A');

//     const requestingThread0 = scenario({id: 'thread1'}, function*() {
//         const progress = yield bp.request(eventA, 1);
//         lowerPrioRequestProgressed = true;
//         expect(progress.event.value).toBe(1);
//     });

//     const requestingThread1 = scenario({id: 'thread2'}, function*() {
//         const progress = yield bp.request(eventA, 5);
//         higherPrioRequestProgressed = true;
//         expect(progress.event.value).toBe(5);
//     });

//     const requestingThread2 = scenario({id: 'thread3'}, function*() {
//         yield bp.request(eventA, 10);
//     });

//     const validatingThread = scenario({id: 'thread4'}, function*() {
//         yield bp.validate(eventA, (nr) => !!nr && nr < 10);
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread0());
//         enable(requestingThread1());
//         enable(requestingThread2());
//         enable(validatingThread());
//     }, () => {
//         expect(lowerPrioRequestProgressed).toBe(true);
//         expect(higherPrioRequestProgressed).toBe(true);
//     });
// });



// test("with multiple askFor for the same eventId, highest priority request is selected - that is also valid", () => {
//     let lowerPrioProgressed = false;
//     let higherPrioProgressed = false;

//     const eventA = new ScenarioEvent<number>('A');

//     const askingThreadLow = scenario({id: 'thread1'}, function*() {
//         yield bp.askFor(eventA, (pl) => !!pl && pl > 10);
//         lowerPrioProgressed = true;
//     });

//     const askingThreadHigh = scenario({id: 'thread2'}, function*() {
//         yield bp.askFor(eventA, (pl) => !!pl && pl < 10);
//         higherPrioProgressed = true;
//     });

//     const requestingThread = scenario({id: 'thread3'}, function*() {
//         yield bp.request(eventA, 11);
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(askingThreadLow());
//         enable(askingThreadHigh());
//         enable(requestingThread());
//     }, () => {
//         expect(lowerPrioProgressed).toBe(true);
//         expect(higherPrioProgressed).toBe(false);

//     });
// });


// test("requesting the same bid multiple times is not allowed and will throw a warning", () => {

//     const eventA = new ScenarioEvent<number>('A');

//     const requestingThread = scenario({id: 'thread1', }, function*() {
//         yield [bp.request(eventA), bp.request(eventA)]
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread());
//     }, ({scenario})=> {
//         const state = scenario({name: 'thread1'});
//         expect(state).toBeDefined();
//         expect(state?.isCompleted).toBe(true);
//         expect(state?.progressionCount).toBe(1);
//     });
// });

// test("the allOf utility function will return if all bids have progressed", (done) => {
//     let timesPromiseWasCreated = 0;
//     const eventA = new ScenarioEvent<number>('A');
//     const eventB = new ScenarioEvent<number>('B');


//     const requestingThread = scenario({id: 'thread1', },
//         function*() {
//             yield* bp.allOf(bp.request(eventA, 1), bp.request(eventB, () => {
//                 timesPromiseWasCreated++;
//                 return delay(200, 3);
//             }));
//     });

//     testScenarios({eventA, eventB}, (enable) => {
//         enable(requestingThread());
//     }, ({scenario})=> {
//         expect(eventA.value).toBe(1);
//         if(scenario('thread1')?.isCompleted) {
//             expect(eventB.value).toBe(3);
//             expect(timesPromiseWasCreated).toBe(1);
//             done();
//         }
//     });
// });


// test("a pending event is cancelled, if the next bid is not asking for the pending event id", (done) => {
//     const eventA = new ScenarioEvent<number>('A');
//     const eventB = new ScenarioEvent<number>('B');
//     const eventCancel = new ScenarioEvent<number>('Cancel');

//     const requestingThread = scenario({id: 'thread1', }, function*() {
//         yield [bp.request(eventA, 1), bp.request(eventB, () => delay(200, 1))];
//         yield bp.request(eventCancel);
//     });

//     testScenarios({eventA, eventB, eventCancel}, (enable) => {
//         enable(requestingThread());
//     }, ({scenario})=> {
//         if(scenario('thread1')?.isCompleted) {
//             expect(eventB.isPending).toBe(false);
//             done();
//         }
//     });
// });


// test("a pending event is cancelled, if the thread completes", (done) => {
//     const eventA = new ScenarioEvent<number>('A');
//     const eventB = new ScenarioEvent<number>('B');

//     const requestingThread = scenario({id: 'thread1', }, function*() {
//         yield [bp.request(eventA, 1), bp.request(eventB, () => delay(200, 1))];
//     })

//     testScenarios({eventA, eventB},(enable) => {
//         enable(requestingThread());
//     }, ({scenario})=> {
//         if(scenario('thread1')?.isCompleted) {
//             expect(eventB.isPending).toBe(false);
//             done();
//         }
//     });
// });


// test("a pending event will not remain pending if the next bids will not include the pending event.", (done) => {
//     const eventA = new ScenarioEvent<number>('A');
//     const eventB = new ScenarioEvent<number>('B');
//     const eventContinue = new ScenarioEvent<number>('Continue');

//     const requestingThread = scenario(null, function*() {
//         yield [bp.request(eventA, 1), bp.request(eventB, () => delay(200, 1))];
//         yield [bp.request(eventB), bp.request(eventContinue)];
//         yield [bp.askFor(eventContinue)]
//     })

//     testScenarios({eventA, eventB, eventContinue}, (enable) => {
//         enable(requestingThread());
//     }, ()=> {
//         if(eventContinue.validate()?.isValid) {
//             expect(eventB.isPending).toBe(false);
//             done();
//         }
//     });
// });
