import * as bp from "../src/bid";
import { testScenarios, delay } from "./testutils";
import { Scenario } from '../src/scenario';
import { ExtendContext } from '../src/extend-context';
import { ScenarioEvent, ScenarioEventKeyed } from "../src";


// Extends
//-------------------------------------------------------------------------

test("requests can be extended", () => {
    const eventA = new ScenarioEvent('A');
    const eventX = new ScenarioEvent('X');
    let progressedRequest = false,
        progressedExtend = false,
        setupCount = 0;

    const thread1 = new Scenario({id: 'requesting thread'}, function* () {
        yield bp.request(eventA);
        progressedRequest = true;
    });

    const thread3 = new Scenario({id: 'extending thread'}, function* () {
        yield bp.extend(eventA);
        progressedExtend = true;
        yield bp.askFor(eventX);
    })

    testScenarios((enable, events) => {
        events(eventA, eventX);
        enable(thread1);
        enable(thread3);
        setupCount++;
    }, () => {
        expect(progressedExtend).toBe(true);
        expect(eventA.isPending).toBeTruthy();
        expect(progressedRequest).toBe(false);
        expect(setupCount).toEqual(2);
    }
 );
});


test("after the extend resolved, the event is no longer pending", (done) => {
    const eventA = new ScenarioEvent<number>('A');
    const eventX = new ScenarioEvent('X');
    const eventZ = new ScenarioEvent('X');

    const thread1 = new Scenario({id: 'requesting thread'}, function* () {
        yield bp.request(eventA, 10);
        yield bp.askFor(eventX);
    });

    const thread3 = new Scenario({id: 'extending thread'}, function* () {
        yield bp.extend(eventA);
        console.log(eventA.isPending)
        expect(eventA.isPending).toBe(true);
        eventA.resolve((prev = 0) => prev + 10);
    })

    testScenarios((enable, events) => {
        events(eventA, eventX, eventZ);
        enable(thread1);
        enable(thread3);
    }, ({log}) => {
        console.log('actions: ', log.actions)
        if(eventX.validate().isValid) {
            expect(eventA.value).toBe(20);
            done();
        }
    }
 );
});

// test("if an extend is not applied, than the next extend will get the event", () => {
//     let requestAdvanced = false;
//     let waitBAdvanced = false;
//     let waitCAdvanced = false;
//     let waitDAdvanced = false;

//     const requestThread = scenario(null, function* () {
//         yield bp.request("A", 1000);
//         requestAdvanced = true;
//     });

//     const waitThread = scenario(null, function* () {
//         yield bp.askFor("A", (pl) => pl === 1000);
//         waitBAdvanced = true;
//     });

//     const extendPriorityLowThread = scenario(null, function* () {
//         yield bp.extend("A", (pl) => pl === 1000);
//         waitCAdvanced = true;
//     });

//     const extendPriorityHighThread = scenario(null, function* () {
//         yield bp.extend("A", (pl) => pl !== 1000);
//         waitDAdvanced = true;
//     });

//     testScenarios((enable) => {
//         enable(requestThread());
//         enable(waitThread());
//         enable(extendPriorityLowThread());
//         enable(extendPriorityHighThread());
//     }, ({event}) => {
//         expect(waitBAdvanced).toBe(false);
//         expect(waitCAdvanced).toBe(true);
//         expect(waitDAdvanced).toBe(false);
//         expect(requestAdvanced).toBe(false);
//         expect(event('A').isPending).toBeTruthy();
//     });
// });

// test("if an extended thread completed, without resolving or rejecting the event, it will keep the event pending", () => {
//     let progressedRequest = false,
//         progressedExtend = false,
//         setupCount = 0;

//     const thread1 = scenario(null, function* () {
//         yield bp.request("A");
//         progressedRequest = true;
//     });

//     const thread3 = scenario(null, function* () {
//         yield bp.extend("A");
//         progressedExtend = true;
//     });

//     testScenarios((enable) => {
//         enable(thread1());
//         enable(thread3());
//         setupCount++;
//     }, ({event}) => {
//         expect(event('A').isPending).toBeTruthy();
//     }
//  );
//     expect(setupCount).toEqual(2);
//     expect(progressedRequest).toBe(false);
//     expect(progressedExtend).toBe(true);
// });


// test("extends will receive a value (like waits)", () => {
//     let extendedValue: any;
//     let thread1Advanced = false;

//     const thread1 = scenario(null, function* () {
//         yield bp.request("A", 1000);
//         thread1Advanced = true;
//     });

//     const thread2 = scenario(null, function* () {
//         yield bp.askFor("A");
//     });

//     const thread3 = scenario(null, function* () {
//         const bid = yield bp.extend("A");
//         extendedValue = bid.payload;
//     });

//     testScenarios((enable) => {
//         enable(thread1());
//         enable(thread2());
//         enable(thread3());
//     }, ({event}) => {
//         expect(thread1Advanced).toBe(false);
//         expect(extendedValue).toBe(1000);
//         expect(event('A').isPending).toBeTruthy();
//     });
// });

// test("blocked events can not be extended", () => {
//     let extendedValue: ExtendContext;
//     let thread1Advanced = false;

//     const thread1 = scenario(null, function* () {
//         yield bp.request("A", 1000);
//         thread1Advanced = true;
//     });

//     const thread2 = scenario(null, function* () {
//         yield bp.block("A");
//     });

//     const thread3 = scenario(null, function* () {
//         const bid = yield bp.extend("A");
//         extendedValue = bid.payload;
//     });

//     testScenarios((enable) => {
//         enable(thread1());
//         enable(thread2());
//         enable(thread3());
//     }, ({event}) => {
//         expect(thread1Advanced).toBe(false);
//         expect(extendedValue).toBe(undefined);
//         expect(event('A').isPending).toBeFalsy();
//     });
// });


// test("extends will extend requests", () => {
//     let extended: bp.ProgressedBid

//     const thread1 = scenario(null, function* () {
//         yield bp.request("A", 1000);
//     });

//     const thread2 = scenario(null, function* () {
//         extended = yield bp.extend("A");
//     });

//     testScenarios((enable) => {
//         enable(thread1());
//         enable(thread2());
//     }, () => {
//         expect(extended.payload).toEqual(1000);
//     });
// });


// test("the last extend that is enabled has the highest priority", () => {
//     let advancedThread1 = false,
//     advancedThread2 = false;

//     const requestThread = scenario(null, function* () {
//         yield bp.request("A");
//     });

//     const extendThread1 = scenario(null, function* () {
//         yield bp.extend("A");
//         advancedThread1 = true;
//     });

//     const extendThread2 = scenario(null, function* () {
//         yield bp.extend("A");
//         advancedThread2 = true;
//     });

//     testScenarios((enable) => {
//         enable(requestThread());
//         enable(extendThread1());
//         enable(extendThread2());
//     },() => {
//         expect(advancedThread1).toBeFalsy();
//         expect(advancedThread2).toBe(true);
//     });
// });


// test("an extend will create a pending event", () => {
//     const requestingThread = scenario(null, function* () {
//         yield bp.request("A", 100); //not an async event
//     });

//     const extendingThread = scenario(null, function* () {
//         yield bp.extend("A"); // but this extend will make it async
//         yield bp.askFor('fin');
//     });

//     testScenarios((enable) => {
//         enable(requestingThread());
//         enable(extendingThread());
//     }, ({event}) => {
//         expect(event('A').isPending).toBe(true);
//     });
// });


// test("an extend will wait for the pending-event to finish before it extends.", (done) => {
//     const requestingThread = scenario({id: 'requestingThread'}, function* () {
//         yield bp.request("A", delay(100, 'resolvedValue'));
//     });

//     const extendingThread = scenario({id: 'extendingThread'}, function* () {
//         const bid = yield bp.extend("A");
//         expect(bid.payload).toBe('resolvedValue');
//         yield bp.request("V", delay(200, 'resolvedValue'));
//     });

//     testScenarios((enable) => {
//         enable(requestingThread());
//         enable(extendingThread());
//     }, ({event, scenario}) => {
//         if(scenario('extendingThread')?.isCompleted) {
//             expect(event('A').isPending).toBeTruthy();
//             expect(scenario('requestingThread')?.isCompleted).toBeFalsy();
//             done();
//         }
//     });
// });


// test("an extend can be resolved. This will progress waits and requests", (done) => {
//     const requestingThread = scenario({id: 'requestingThread'}, function* () {
//         const bid = yield bp.request("A", delay(100, 'value'));
//         expect(bid.payload).toBe('value extended');
//     });

//     const extendingThread = scenario({id: 'extendingThread'}, function* () {
//         const extend = yield bp.extend("A");
//         expect(extend.payload).toBe('value');
//         extend.resolve?.(extend.payload + " extended");
//     });

//     const waitingThread = scenario({id: 'waitingThread'}, function* () {
//         const bid = yield bp.askFor("A");
//         expect(bid.payload).toBe('value extended');
//         yield bp.askFor('fin');
//     });

//     testScenarios((enable) => {
//         enable(requestingThread());
//         enable(extendingThread());
//         enable(waitingThread());
//     }, ({event}) => {
//         if(event('fin').dispatch) {
//             done();
//         }
//     });
// });

// test("an extend will keep the event-pending if the BThread with the extend completes.", (done) => {
//     let requestingThreadProgressed = false;
//     const requestingThread = scenario(null, function* () {
//         yield bp.request("A", 1);
//         requestingThreadProgressed = true;
//     });

//     const extendingThread = scenario(null, function* () {
//         yield bp.extend("A");
//         // after the extend, this BThread completes, keeping the extend active.
//     });

//     testScenarios((enable) => {
//         enable(requestingThread());
//         enable(extendingThread());
//     }, ({event}) => {
//         expect(event('A').isPending).toBeTruthy();
//         expect(requestingThreadProgressed).toBe(false);
//         done();
//     });
// });

// test("multiple extends will resolve after another. After all extends complete, the request and wait will continue", (done) => {
//     const requestingThread = scenario(null, function* () {
//         const bid = yield bp.request("A", delay(100, 'super'));
//         expect(bid.payload).toBe('super extend1 extend2');
//     });

//     const extendingThread = scenario(null, function* () {
//         const extend = yield bp.extend("A");
//         expect(extend.payload).toBe('super extend1');
//         extend.resolve?.(extend.payload + " extend2");
//     });

//     const extendingThreadHigherPriority = scenario(null, function* () {
//         const extend = yield bp.extend("A");
//         expect(extend.payload).toBe('super');
//         extend.resolve?.(extend.payload + ' extend1');
//     });

//     const waitingThread = scenario(null, function* () {
//         const bid = yield bp.askFor("A");
//         expect(bid.payload).toBe('super extend1 extend2');
//         yield bp.askFor('fin');
//     });

//     testScenarios((enable) => {
//         enable(requestingThread());
//         enable(extendingThread());
//         enable(extendingThreadHigherPriority()); // this BThread is enabled after the first extendingThread, giving it a higher priority
//         enable(waitingThread());
//     }, ({event}) => {
//         if(event('fin').dispatch) {
//             done();
//         }
//     });
// });

// test("an extend will be resolved in the same cycle", () => {
//     let loopCount = 0;
//     let requestedValue: number;

//     const requestingThread = scenario(null, function* () {
//         const bid = yield bp.request("A", 1);
//         requestedValue = bid.payload;
//     });

//     const extendingThread = scenario(null, function* () {
//         const bid = yield bp.extend("A");
//         bid.resolve?.(bid.payload + 1);
//     });

//     testScenarios((enable) => {
//         loopCount++;
//         enable(requestingThread());
//         enable(extendingThread());
//     }, ({event}) => {
//         expect(event('A').isPending).toBeFalsy();
//         expect(requestedValue).toEqual(2);
//         expect(loopCount).toEqual(2); // 1: init, 2: request + extend
//     });
// });

// test("an extend can have an optional validation-function", () => {

//     const requestingThread = scenario(null, function* () {
//         const bid = yield bp.request("A", 1);
//         expect(bid.payload).toBe(10);
//         const bid2 = yield bp.request("A", 2);
//         expect(bid2.payload).toBe(99);
//     });

//     const extendingThreadOne = scenario(null, function* () {
//         const bid = yield bp.extend("A", (val) => val === 2);
//         bid.resolve?.(99);
//     });
//     const extendingThreadTwo = scenario(null, function* () {
//         const bid = yield bp.extend("A", (val) => val === 1);
//         bid.resolve?.(10);
//     });

//     testScenarios((enable) => {
//         enable(requestingThread());
//         enable(extendingThreadOne());
//         enable(extendingThreadTwo());
//     }, ({event}) => {
//         expect(event('A').isPending).toBeFalsy();
//     });
// });

// test("a wait can be extended. during the extension, the event is pending", (done) => {
//     const waitingThread = scenario(null, function* () {
//         yield bp.askFor("AB");
//     });

//     const extendingThread = scenario(null, function* () {
//         const x = yield bp.extend("AB");
//         yield bp.askFor('fin');
//     });

//     testScenarios((enable) => {
//         enable(waitingThread());
//         enable(extendingThread());
//     }, ({event}) => {
//         if(event('AB').dispatch !== undefined) event('AB').dispatch!();
//         else {
//             expect(event('AB').isPending).toBe(true);
//             done();
//         }

//     });
// });

// test("a askFor can be extended. After resolving the extend, the wait will be continued", (done) => {
//     let timesEventADispatched = 0;

//     const waitingThread = scenario({id: 'waitingBThread'}, function* () {
//         const bid = yield [bp.askFor("eventAX"), bp.askFor("eventB")];
//         expect(bid.payload).toBe(12);
//         expect(timesEventADispatched).toBe(1);
//         done();
//     });

//     const extendingThread = scenario({id: 'extendingBThread'}, function* () {
//         const x = yield bp.extend("eventAX");
//         yield bp.request('ASYNC', () => delay(200));
//         x.resolve!(12);
//     });


//     testScenarios((enable) => {
//         enable(waitingThread());
//         enable(extendingThread());
//     }, ({event, log}) => {
//         if(event('eventAX').dispatch !== undefined) {
//             event('eventAX')!.dispatch!(10);
//             timesEventADispatched++;
//         }
//     });
// });

// test("a request can be extended. After resolving the extend, the request will be continued", (done) => {

//     const requestingThread = scenario({id: 'requestingThread'}, function* () {
//         const bid = yield bp.request("eventAtt");
//         expect(bid.payload).toBe(12);
//         done();
//     });

//     const extendingThread = scenario({id: 'extendingBThread'}, function* () {
//         const x = yield bp.extend("eventAtt");
//         yield bp.request('ASYNC', () => delay(200));
//         x.resolve?.(12);
//     });


//     testScenarios((enable) => {
//         enable(requestingThread());
//         enable(extendingThread());
//     });
// });


// test("a request can be extended. After resolving the extend, the extend-bid will not be used again in this run.", (done) => {

//     const requestingThread = scenario({id: 'requestingThread'}, function* () {
//         const bid = yield bp.request("eventiii");
//         expect(bid.payload).toBe(12);
//         done();
//     });

//     const extendingThread = scenario({id: 'extendingBThread'}, function* () {
//         while(true) {
//             const x = yield bp.extend("eventiii");
//             yield bp.request('ASYNC', () => delay(200));
//             x.resolve?.(12);
//         }
//     });

//     testScenarios((enable) => {
//         enable(requestingThread());
//         enable(extendingThread());
//     });
// });

// extending Bids - where to attach the pending-event-promises?
// an extend can not be rejected!

// a request: the requesting BThread
// - the event is stored in the extending BThread, so that
//   if during the extend, the requesting BThread is deleted, the resolved extend will resolve the event
//   if during the extend, the extending BThread is deleted, the event will be lost
