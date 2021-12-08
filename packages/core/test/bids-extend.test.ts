import * as bp from "../src/bid";
import { testScenarios, delay } from "./testutils";
import { Flow } from '../src/flow';
import { FlowEvent, UserEvent } from "../src";


// Extends
//-------------------------------------------------------------------------

test("requests can be extended", () => {
    const eventA = new FlowEvent('A');
    let progressedRequest = false,
        progressedExtend = false,
        setupCount = 0;

    const thread1 = new Flow('requesting thread', function* () {
        yield bp.request(eventA);
        progressedRequest = true;
    });

    const thread3 = new Flow('extending thread', function* () {
        yield bp.extend(eventA);
        progressedExtend = true;
    })

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
        enable(thread3);
        setupCount++;
    }, () => {
        expect(progressedExtend).toBe(true);
        expect(progressedRequest).toBe(false);

        expect(eventA.isPending).toBeTruthy();
        expect(setupCount).toEqual(2);
    }
 );
});


test("after the extend resolved, the event is no longer pending", (done) => {
    const eventA = new FlowEvent<number>('A');
    const eventZ = new UserEvent('Z');

    const thread1 = new Flow('requesting thread', function* () {
        yield bp.request(eventA, 100);
        yield bp.askFor(eventZ);
    });

    const thread3 = new Flow('extending thread', function* () {
        yield bp.extend(eventA);
        expect(eventA.isPending).toBe(true);
        expect(eventA.value).toBe(undefined); // the request is not yet resolved.
        this.resolveExtend(eventA, (this.getExtendValue(eventA) || 0) + 10 );
    })

    testScenarios((enable, events) => {
        events(eventA, eventZ);
        enable(thread1);
        enable(thread3);
    }, () => {
        if(eventZ.isValid()) {
            expect(eventA.value).toBe(110);
            done();
        }
    }
 );
});

test("a utility generator can be used to get a typed extend value ", (done) => {
    const eventA = new FlowEvent<number>('A');
    const eventZ = new UserEvent('Z');

    const thread1 = new Flow('requesting thread', function* () {
        yield bp.request(eventA, 100);
        yield bp.askFor(eventZ);
    });

    const thread3 = new Flow('extending thread', function* () {
        const value = yield* bp.extendBid(eventA);
        expect(eventA.isPending).toBe(true);
        expect(eventA.value).toBe(undefined); // the request is not yet resolved.
        this.resolveExtend(eventA, (value || 0) + 10 );
    })

    testScenarios((enable, events) => {
        events(eventA, eventZ);
        enable(thread1);
        enable(thread3);
    }, () => {
        if(eventZ.isValid()) {
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

    const eventA = new FlowEvent<number>('A');

    const requestThread = new Flow('requestThread', function* () {
        yield bp.request(eventA, 1000);
        requestAdvanced = true;
    });

    const waitThread = new Flow('waitThread', function* () {
        yield bp.waitFor(eventA, (pl) => pl === 1000);
        waitBAdvanced = true;
    });

    const extendPriorityLowThread = new Flow('extendPriorityLowThread', function* () {
        yield bp.extend(eventA, (pl) => pl === 1000);
        waitCAdvanced = true;
    });

    const extendPriorityHighThread = new Flow('extendPriorityHighThread', function* () {
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

    const eventA = new FlowEvent<number>('A');


    const thread1 = new Flow('thread1', function* () {
        yield bp.request(eventA);
        progressedRequest = true;
    });

    const thread3 = new Flow('thread2', function* () {
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


test("extended values can be accessed with the getExtendValue function", (done) => {
    let thread1Advanced = false;
    const eventA = new FlowEvent<number>('A');


    const thread1 = new Flow('thread1', function* () {
        yield bp.request(eventA, 1000);
        thread1Advanced = true;
    });

    const thread2 = new Flow('thread2', function* () {
        yield bp.waitFor(eventA);
    });

    const thread3 = new Flow('thread3', function* () {
        yield bp.extend(eventA);
        expect(thread1Advanced).toBe(false);
        expect(this.getExtendValue(eventA)).toBe(1000);
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
    let thread1Advanced = false,
        extendAdvanced = false;

    const eventA = new FlowEvent<number>('A');


    const thread1 = new Flow('thread1', function* () {
        yield bp.request(eventA, 1000);
        thread1Advanced = true;
    });

    const thread2 = new Flow('thread2', function* () {
        yield bp.block(eventA);
    });

    const thread3 = new Flow('thread3', function* () {
        yield bp.extend(eventA);
        extendAdvanced = true;
    });

    testScenarios((enable, event) => {
        event(eventA)
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
    const eventA = new FlowEvent<number>('A');
    let extendedPayload: number | undefined = 0;

    const thread1 = new Flow('thread1', function* () {
        yield bp.request(eventA, 1000);
    });

    const thread2 = new Flow('thread2', function* () {
        extendedPayload = yield* bp.extendBid(eventA);
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
    const eventA = new FlowEvent<number>('A');


    const requestThread = new Flow('requestThread', function* () {
        yield bp.request(eventA);
    });

    const extendThread1 = new Flow('extendThread1', function* () {
        yield bp.extend(eventA);
        advancedThread1 = true;
    });

    const extendThread2 = new Flow('extendThread2', function* () {
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
    const eventA = new FlowEvent<number>('A');
    const eventFin = new UserEvent('Fin');


    const requestingThread = new Flow('requestingThread', function* () {
        yield bp.request(eventA, 100); //not an async event
    });

    const extendingThread = new Flow('extendingThread', function* () {
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
    const eventA = new FlowEvent<number | undefined>('A');
    let checkFunctionIsCalled = false;

    const requestingThread = new Flow('requestingThread', function* () {
        yield bp.request(eventA, () => delay(100, 1000));
    });

    const extendingThread = new Flow('extendingThread', function* () {
        yield bp.extend(eventA, (x) => {
            checkFunctionIsCalled = true;
            return x === 1000
        });
        const extendValue = this.getExtendValue(eventA);
        expect(extendValue).toBe(1000);
        this.resolveExtend(eventA, (extendValue || 0) + 10 )
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
    const eventA = new FlowEvent<string | undefined>('A');
    const eventFin = new UserEvent('Fin');


    const requestingThread = new Flow('requestingThread', function* () {
        yield bp.request(eventA, () => delay(100, 'value'));
        expect(eventA.value).toBe('value extended');
    });

    const extendingThread = new Flow('extendingThread', function* () {
        const value = yield* bp.extendBid(eventA);
        expect(value).toBe('value');
        this.resolveExtend(eventA, value + " extended");
    });

    const waitingThread = new Flow('waitingThread', function* () {
        yield bp.waitFor(eventA);
        expect(eventA.value).toBe('value extended');
        yield bp.askFor(eventFin);
    });

    testScenarios((enable, events) => {
        events(eventA, eventFin);
        enable(requestingThread);
        enable(extendingThread);
        enable(waitingThread);
    }, () => {
        if(eventFin.isValid()) {
            done();
        }
    });
});

test("an extend will keep the event-pending if the Flow with the extend completes.", (done) => {
    let requestingThreadProgressed = false;
    const eventA = new FlowEvent<number>('A');


    const requestingThread = new Flow('requestingThread', function* () {
        yield bp.request(eventA, 1);
        requestingThreadProgressed = true;
    });

    const extendingThread = new Flow('extendingThread', function* () {
        yield bp.extend(eventA);
        // after the extend, this Flow completes, keeping the extend active.
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
    const eventA = new FlowEvent<string | undefined>('Arrr');
    const eventFin = new UserEvent('Fin');

    const requestingThread = new Flow('requestingThread', function* () {
        yield bp.request(eventA, () => delay(100, 'super'));
        expect(eventA.value).toBe('super extend1 extend2');
    });

    const extendingThread = new Flow('extendingThread', function* () {
        const value = yield* bp.extendBid(eventA);
        expect(eventA.value).toBe(undefined);
        expect(value).toBe('super extend1');
        this.resolveExtend(eventA, value + ' extend2');
    });

    const extendingThreadHigherPriority = new Flow('extendingThreadHigherPriority', function* () {
        const value = yield* bp.extendBid(eventA);
        expect(value).toBe('super');
        this.resolveExtend(eventA, value + ' extend1');
    });

    const waitingThread = new Flow('waitingThread', function* () {
        yield bp.waitFor(eventA);
        expect(eventA.value).toBe('super extend1 extend2');
        yield bp.askFor(eventFin);
    });

    testScenarios((enable, events) => {
        events(eventA, eventFin);
        enable(requestingThread);
        enable(extendingThread);
        enable(extendingThreadHigherPriority); // this Flow is enabled after the first extendingThread, giving it a higher priority
        enable(waitingThread);
    }, () => {
        if(eventFin.isValid()) {
            done();
        }
    });
});


test("an extend can have an optional validation-function", (done) => {
    const eventA = new FlowEvent<number>('A');

    const requestingThread = new Flow('requestingThread', function* () {
        yield bp.request(eventA, 1);
        expect(eventA.value).toBe(11);
        yield bp.request(eventA, 2);
        expect(eventA.value).toBe(99);
        done();
    });

    const extendingThreadOne = new Flow('extendingThreadOne', function* () {
        yield bp.extend(eventA, (val) => val === 2);
        this.resolveExtend(eventA, 99);
    });
    const extendingThreadTwo = new Flow('extendingThreadTwo', function* () {
        const value = yield* bp.extendBid(eventA, (val) => val === 1);
        this.resolveExtend(eventA, (value || 0) + 10);
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(requestingThread);
        enable(extendingThreadOne);
        enable(extendingThreadTwo);
    });
});

test("an askFor can be extended. during the extension, the event is pending", (done) => {
    const eventA = new UserEvent('A');
    const eventFin = new UserEvent('Fin');

    const waitingThread = new Flow('waitingThread', function* () {
        yield bp.askFor(eventA);
    });

    const extendingThread = new Flow('extendingThread', function* () {
        yield bp.extend(eventA);
        yield bp.askFor(eventFin);
    });


    testScenarios((enable, events) => {
        events(eventA, eventFin)
        enable(waitingThread);
        enable(extendingThread);
    }, () => {
        if(eventA.isValid()) eventA.dispatch();
        else {
            expect(eventA.isPending).toBe(true);
            done();
        }

    });
});


// a request: the requesting Flow
// - the event is stored in the extending Flow, so that
//   if during the extend, the requesting Flow is deleted, the resolved extend will resolve the event
//   if during the extend, the extending Flow is deleted, the event will be lost
