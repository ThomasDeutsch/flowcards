import * as bp from "../src/bid";
import { testScenarios, delay } from "./testutils";
import { Scenario } from '../src/scenario';
import { ExtendContext, ScenarioEvent, ScenarioEventKeyed } from "../src";


// Extends
//-------------------------------------------------------------------------

test("requests can be extended", () => {
    const eventA = new ScenarioEvent('A');
    const eventX = new ScenarioEvent('X');
    let progressedRequest = false,
        progressedExtend = false,
        setupCount = 0;

    const thread1 = new Scenario('requesting thread', function* () {
        yield bp.request(eventA);
        progressedRequest = true;
    });

    const thread3 = new Scenario('extending thread', function* () {
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

    const thread1 = new Scenario('requesting thread', function* () {
        yield bp.request(eventA, 100);
        yield bp.askFor(eventX);
    });

    const thread3 = new Scenario('extending thread', function* () {
        yield bp.extend(eventA);
        expect(eventA.isPending).toBe(true);
        expect(eventA.value).toBe(undefined); // the request is not yet resolved.
        this.getExtend(eventA)?.resolve((x=0) => x + 10 ); // the resolve-fn will provide the extend-value ( 100 )
    })

    testScenarios((enable, events) => {
        events(eventA, eventX, eventZ);
        enable(thread1);
        enable(thread3);
    }, () => {
        if(eventX.validate().isValid) {
            expect(eventA.value).toBe(110);
            done();
        }
    }
 );
});

test("if an extend is not applied, than the next extend will get the event", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;
    let waitCAdvanced = false;
    let waitDAdvanced = false;

    const eventA = new ScenarioEvent<number>('A');

    const requestThread = new Scenario('requestThread', function* () {
        yield bp.request(eventA, 1000);
        requestAdvanced = true;
    });

    const waitThread = new Scenario('waitThread', function* () {
        yield bp.askFor(eventA, (pl) => pl === 1000);
        waitBAdvanced = true;
    });

    const extendPriorityLowThread = new Scenario('extendPriorityLowThread', function* () {
        yield bp.extend(eventA, (pl) => pl === 1000);
        waitCAdvanced = true;
    });

    const extendPriorityHighThread = new Scenario('extendPriorityHighThread', function* () {
        yield bp.extend(eventA, (pl) => pl !== 1000);
        waitDAdvanced = true;
    });

    testScenarios((enable, events) => {
        events(eventA)
        enable(requestThread);
        enable(waitThread);
        enable(extendPriorityLowThread);
        enable(extendPriorityHighThread);
    }, () => {
        expect(waitBAdvanced).toBe(false);
        expect(waitCAdvanced).toBe(true);
        expect(waitDAdvanced).toBe(false);
        expect(requestAdvanced).toBe(false);
        expect(eventA.isPending).toBeTruthy();
    });
});

test("if an extended thread completed, without resolving or rejecting the event, it will keep the event pending", () => {
    let progressedRequest = false,
        progressedExtend = false,
        setupCount = 0;

    const eventA = new ScenarioEvent<number>('A');


    const thread1 = new Scenario('thread1', function* () {
        yield bp.request(eventA);
        progressedRequest = true;
    });

    const thread3 = new Scenario('thread2', function* () {
        yield bp.extend(eventA);
        progressedExtend = true;
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
        enable(thread3);
        setupCount++;
    }, () => {
        expect(eventA.isPending).toBeTruthy();
    }
 );
    expect(setupCount).toEqual(2);
    expect(progressedRequest).toBe(false);
    expect(progressedExtend).toBe(true);
});


test("extended values can be accessed with the getExtend function", (done) => {
    let thread1Advanced = false;
    const eventA = new ScenarioEvent<number>('A');


    const thread1 = new Scenario('thread1', function* () {
        yield bp.request(eventA, 1000);
        thread1Advanced = true;
    });

    const thread2 = new Scenario('thread2', function* () {
        yield bp.askFor(eventA);
    });

    const thread3 = new Scenario('thread3', function* () {
        yield bp.extend(eventA);
        expect(thread1Advanced).toBe(false);
        expect(this.getExtend(eventA)?.value).toBe(1000);
        expect(eventA.isPending).toBeTruthy();
        done();
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
        enable(thread2);
        enable(thread3);
    });
});

test("blocked events can not be extended", () => {
    let extendedValue: number;
    let thread1Advanced = false,
        extendAdvanced = false;

    const eventA = new ScenarioEvent<number>('A');


    const thread1 = new Scenario('thread1', function* () {
        yield bp.request(eventA, 1000);
        thread1Advanced = true;
    });

    const thread2 = new Scenario('thread2', function* () {
        yield bp.block(eventA);
    });

    const thread3 = new Scenario('thread3', function* () {
        yield bp.extend(eventA);
        extendAdvanced = true;
    });

    testScenarios((enable) => {
        enable(thread1);
        enable(thread2);
        enable(thread3);
    }, () => {
        expect(thread1Advanced).toBe(false);
        expect(extendAdvanced).toBe(false);
        expect(eventA.isPending).toBeFalsy();
    });
});


test("extends will extend requests", () => {
    const eventA = new ScenarioEvent<number>('A');
    let extendedPayload: number | undefined = 0;

    const thread1 = new Scenario('thread1', function* () {
        yield bp.request(eventA, 1000);
    });

    const thread2 = new Scenario('thread2', function* () {
        yield bp.extend(eventA);
        extendedPayload = this.getExtend(eventA)?.value;
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
        enable(thread2);
    }, () => {
        expect(extendedPayload).toEqual(1000);
    });
});


test("the last extend that is enabled has the highest priority", () => {
    let advancedThread1 = false,
    advancedThread2 = false;
    const eventA = new ScenarioEvent<number>('A');


    const requestThread = new Scenario('requestThread', function* () {
        yield bp.request(eventA);
    });

    const extendThread1 = new Scenario('extendThread1', function* () {
        yield bp.extend(eventA);
        advancedThread1 = true;
    });

    const extendThread2 = new Scenario('extendThread2', function* () {
        yield bp.extend(eventA);
        advancedThread2 = true;
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(requestThread);
        enable(extendThread1);
        enable(extendThread2);
    },() => {
        expect(advancedThread1).toBeFalsy();
        expect(advancedThread2).toBe(true);
    });
});


test("an extend will create a pending event", () => {
    const eventA = new ScenarioEvent<number>('A');
    const eventFin = new ScenarioEvent('Fin');


    const requestingThread = new Scenario('requestingThread', function* () {
        yield bp.request(eventA, 100); //not an async event
    });

    const extendingThread = new Scenario('extendingThread', function* () {
        yield bp.extend(eventA); // but this extend will make it async
        yield bp.askFor(eventFin);
    });

    testScenarios((enable, events) => {
        events(eventA, eventFin);
        enable(requestingThread);
        enable(extendingThread);
    }, () => {
        expect(eventA.isPending).toBe(true);
    });
});


test("an extend will wait for the pending-event to finish before it extends.", (done) => {
    const eventA = new ScenarioEvent<number>('A');
    let checkFunctionIsCalled = false;

    const requestingThread = new Scenario('requestingThread', function* () {
        yield bp.request(eventA, () => delay(100, 1000));
    });

    const extendingThread = new Scenario('extendingThread', function* () {
        yield bp.extend(eventA, (x) => {
            checkFunctionIsCalled = true;
            return x === 1000
        });
        const extend = this.getExtend(eventA);
        expect(extend?.value).toBe(1000);
        extend?.resolve((x=0) => x + 10 )
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(requestingThread);
        enable(extendingThread);
    }, () => {
        if(requestingThread.isCompleted) {
            expect(eventA.value).toBe(1010);
            expect(checkFunctionIsCalled).toBe(true);
            done();
        }
    });
});


test("an extend can be resolved. This will progress waits and requests", (done) => {
    const eventA = new ScenarioEvent<string>('A');
    const eventFin = new ScenarioEvent('Fin');


    const requestingThread = new Scenario('requestingThread', function* () {
        yield bp.request(eventA, () => delay(100, 'value'));
        expect(eventA.value).toBe('value extended');
    });

    const extendingThread = new Scenario('extendingThread', function* () {
        yield bp.extend(eventA);
        const ext = this.getExtend(eventA);
        expect(ext?.value).toBe('value');
        ext?.resolve((val) => val + " extended");
    });

    const awaitThread = new Scenario('awaitThread', function* () {
        yield bp.askFor(eventA);
        expect(eventA.value).toBe('value extended');
        yield bp.askFor(eventFin);
    });

    const waitingThread = new Scenario('waitingThread', function* () {
        yield bp.askFor(eventA);
        expect(eventA.value).toBe('value extended');
        yield bp.askFor(eventFin);
    });

    testScenarios((enable, events) => {
        events(eventA, eventFin);
        enable(requestingThread);
        enable(extendingThread);
        enable(awaitThread);
        enable(waitingThread);
    }, () => {
        if(eventFin.validate().isValid) {
            done();
        }
    });
});

test("an extend will keep the event-pending if the BThread with the extend completes.", (done) => {
    let requestingThreadProgressed = false;
    const eventA = new ScenarioEvent<number>('A');


    const requestingThread = new Scenario('requestingThread', function* () {
        yield bp.request(eventA, 1);
        requestingThreadProgressed = true;
    });

    const extendingThread = new Scenario('extendingThread', function* () {
        yield bp.extend(eventA);
        // after the extend, this BThread completes, keeping the extend active.
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(requestingThread);
        enable(extendingThread);
    }, () => {
        expect(eventA.isPending).toBeTruthy();
        expect(requestingThreadProgressed).toBe(false);
        done();
    });
});

test("multiple extends will resolve after another. After all extends complete, the request and wait will continue", (done) => {
    const eventA = new ScenarioEvent<string>('Axxx');
    const eventFin = new ScenarioEvent('Fin');

    const requestingThread = new Scenario('requestingThread', function* () {
        yield bp.request(eventA, () => delay(100, 'super'));
        expect(eventA.value).toBe('super extend1 extend2');
    });

    const extendingThread = new Scenario('extendingThread', function* () {
        yield bp.extend(eventA);
        const ext = this.getExtend(eventA);
        expect(eventA.value).toBe(undefined);
        expect(ext?.value).toBe('super extend1');
        ext?.resolve((val) => val + " extend2");
    });

    const extendingThreadHigherPriority = new Scenario('extendingThreadHigherPriority', function* () {
        yield bp.extend(eventA);
        const ext = this.getExtend(eventA);
        expect(ext?.value).toBe('super');
        ext?.resolve((val) => val + ' extend1');
    });

    const waitingThread = new Scenario('waitingThread', function* () {
        yield bp.waitFor(eventA);
        expect(eventA.value).toBe('super extend1 extend2');
        yield bp.askFor(eventFin);
    });

    testScenarios((enable, events) => {
        events(eventA, eventFin);
        enable(requestingThread);
        enable(extendingThread);
        enable(extendingThreadHigherPriority); // this BThread is enabled after the first extendingThread, giving it a higher priority
        enable(waitingThread);
    }, (context) => {
        if(eventFin.validate().isValid) {
            done();
        }
    });
});

// test("an extend will be resolved in the same cycle", () => {
//     let loopCount = 0;
//     let requestedValue: number;

//     const requestingThread = new Scenario(null, function* () {
//         const bid = yield bp.request("A", 1);
//         requestedValue = bid.payload;
//     });

//     const extendingThread = new Scenario(null, function* () {
//         const bid = yield bp.extend("A");
//         bid.resolve?.(bid.payload + 1);
//     });

//     testScenarios((enable) => {
//         loopCount++;
//         enable(requestingThread);
//         enable(extendingThread);
//     }, ({event}) => {
//         expect(event('A').isPending).toBeFalsy();
//         expect(requestedValue).toEqual(2);
//         expect(loopCount).toEqual(2); // 1: init, 2: request + extend
//     });
// });

// test("an extend can have an optional validation-function", () => {

//     const requestingThread = new Scenario(null, function* () {
//         const bid = yield bp.request("A", 1);
//         expect(bid.payload).toBe(10);
//         const bid2 = yield bp.request("A", 2);
//         expect(bid2.payload).toBe(99);
//     });

//     const extendingThreadOne = new Scenario(null, function* () {
//         const bid = yield bp.extend("A", (val) => val === 2);
//         bid.resolve?.(99);
//     });
//     const extendingThreadTwo = new Scenario(null, function* () {
//         const bid = yield bp.extend("A", (val) => val === 1);
//         bid.resolve?.(10);
//     });

//     testScenarios((enable) => {
//         enable(requestingThread);
//         enable(extendingThreadOne);
//         enable(extendingThreadTwo);
//     }, ({event}) => {
//         expect(event('A').isPending).toBeFalsy();
//     });
// });

// test("a wait can be extended. during the extension, the event is pending", (done) => {
//     const waitingThread = new Scenario(null, function* () {
//         yield bp.askFor("AB");
//     });

//     const extendingThread = new Scenario(null, function* () {
//         const x = yield bp.extend("AB");
//         yield bp.askFor('fin');
//     });

//     testScenarios((enable) => {
//         enable(waitingThread);
//         enable(extendingThread);
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

//     const waitingThread = new Scenario({id: 'waitingBThread'}, function* () {
//         const bid = yield [bp.askFor("eventAX"), bp.askFor("eventB")];
//         expect(bid.payload).toBe(12);
//         expect(timesEventADispatched).toBe(1);
//         done();
//     });

//     const extendingThread = new Scenario({id: 'extendingBThread'}, function* () {
//         const x = yield bp.extend("eventAX");
//         yield bp.request('ASYNC', () => delay(200));
//         x.resolve!(12);
//     });


//     testScenarios((enable) => {
//         enable(waitingThread);
//         enable(extendingThread);
//     }, ({event, log}) => {
//         if(event('eventAX').dispatch !== undefined) {
//             event('eventAX')!.dispatch!(10);
//             timesEventADispatched++;
//         }
//     });
// });

// test("a request can be extended. After resolving the extend, the request will be continued", (done) => {

//     const requestingThread = new Scenario({id: 'requestingThread'}, function* () {
//         const bid = yield bp.request("eventAtt");
//         expect(bid.payload).toBe(12);
//         done();
//     });

//     const extendingThread = new Scenario({id: 'extendingBThread'}, function* () {
//         const x = yield bp.extend("eventAtt");
//         yield bp.request('ASYNC', () => delay(200));
//         x.resolve?.(12);
//     });


//     testScenarios((enable) => {
//         enable(requestingThread);
//         enable(extendingThread);
//     });
// });


// test("a request can be extended. After resolving the extend, the extend-bid will not be used again in this run.", (done) => {

//     const requestingThread = new Scenario({id: 'requestingThread'}, function* () {
//         const bid = yield bp.request("eventiii");
//         expect(bid.payload).toBe(12);
//         done();
//     });

//     const extendingThread = new Scenario({id: 'extendingBThread'}, function* () {
//         while(true) {
//             const x = yield bp.extend("eventiii");
//             yield bp.request('ASYNC', () => delay(200));
//             x.resolve?.(12);
//         }
//     });

//     testScenarios((enable) => {
//         enable(requestingThread);
//         enable(extendingThread);
//     });
// });


// a request: the requesting BThread
// - the event is stored in the extending BThread, so that
//   if during the extend, the requesting BThread is deleted, the resolved extend will resolve the event
//   if during the extend, the extending BThread is deleted, the event will be lost
