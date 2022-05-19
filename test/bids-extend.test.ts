import * as bp from "../src/bid";
import { testScenarios, delay, failedDelay } from "./testutils";
import { Flow } from '../src/flow';
import { FlowEvent, UserEvent } from "../src/event";


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

    testScenarios(enable => {
        enable(thread1);
        enable(thread3);
        setupCount++;
    }, eventA, () => {
        expect(progressedExtend).toBe(true);
        expect(progressedRequest).toBe(false);
        expect(eventA.extendedBy?.name).toBe('extending thread');
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
        expect(eventA.value).toBe(undefined); // the request is not yet resolved.
        this.resolveExtend(eventA, (this.getExtendValue(eventA) || 0) + 10);
    })

    testScenarios((enable) => {
        enable(thread1);
        enable(thread3);
    }, [eventA, eventZ], () => {
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
        expect(eventA.pendingBy).toBe(undefined);
        expect(eventA.extendedBy?.name).toBe('extending thread');
        expect(eventA.value).toBe(undefined); // the request is not yet resolved.
        this.resolveExtend(eventA, (value || 0) + 10 );
    })

    testScenarios((enable) => {
        enable(thread1);
        enable(thread3);
    }, [eventA, eventZ], () => {
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

    testScenarios((enable) => {
        enable(requestThread);
        enable(waitThread);
        enable(extendPriorityLowThread);
        enable(extendPriorityHighThread);
    }, eventA, () => {
        expect(waitBAdvanced).toBe(false);
        expect(waitCAdvanced).toBe(true);
        expect(waitDAdvanced).toBe(false);
        expect(requestAdvanced).toBe(false);
        expect(eventA.extendedBy?.name).toBe('extendPriorityLowThread');
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

    testScenarios((enable) => {
        enable(thread1);
        enable(thread3);
        setupCount++;
    }, eventA, () => {
        expect(eventA.extendedBy).toBeDefined();
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
        expect(eventA.extendedBy).toBeDefined();
        done();
    });

    testScenarios((enable) => {
        enable(thread1);
        enable(thread2);
        enable(thread3);
    }, eventA);
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
        yield bp.validate(eventA, () => false);
    });

    const thread3 = new Flow('thread3', function* () {
        yield bp.extend(eventA);
        extendAdvanced = true;
    });

    testScenarios((enable) => {
        enable(thread1);
        enable(thread2);
        enable(thread3);
    }, eventA, () => {
        expect(thread1Advanced).toBe(false);
        expect(extendAdvanced).toBe(false);
        expect(eventA.extendedBy).toBeUndefined();
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

    testScenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, eventA, () => {
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

    testScenarios((enable) => {
        enable(requestThread);
        enable(extendThread1);
        enable(extendThread2);
    }, eventA,() => {
        expect(advancedThread1).toBeFalsy();
        expect(advancedThread2).toBe(true);
    });
});


test("an extend will set the event into a pending state", () => {
    const eventA = new FlowEvent<number>('A');
    const eventFin = new UserEvent('Fin');


    const requestingThread = new Flow('requestingThread', function* () {
        yield bp.request(eventA, 100); //not an async event
    });

    const extendingThread = new Flow('extendingThread', function* () {
        yield bp.extend(eventA); // but this extend will make it async
        yield bp.askFor(eventFin);
    });

    testScenarios((enable) => {
        enable(requestingThread);
        enable(extendingThread);
    }, [eventA, eventFin], () => {
        expect(eventA.extendedBy).toBeDefined();
    });
});


test("async events can be extended", (done) => {
    const eventA = new FlowEvent<number | undefined>('A');
    let checkFunctionIsCalled = false;

    const requestingThread = new Flow('requestingThread', function* () {
        yield bp.request(eventA, () => delay(100, 100));
    });

    const extendingThread = new Flow('extendingThread', function* () {
        yield bp.extend(eventA, (x) => {
            checkFunctionIsCalled = true;
            return (x === 100)
        });
        const extendValue = this.getExtendValue(eventA);
        expect(extendValue).toBe(100);
        this.resolveExtend(eventA, (extendValue || 0) + 10 )
    });

    testScenarios((enable) => {
        enable(requestingThread);
        enable(extendingThread);
    }, eventA, () => {
        if(requestingThread.isCompleted) {
            expect(eventA.value).toBe(110);
            expect(checkFunctionIsCalled).toBe(true);
            done();
        }
    });
});


test("an extended pending event can be canceled by the extending flow", (done) => {
    const eventA = new FlowEvent<string | undefined>('AEvent');
    const eventX = new FlowEvent<string | undefined>('EventX');
    const eventCancel = new FlowEvent<string | undefined>('cancelEvent');
    let checkFunctionIsCalled = false;

    const requestingThread = new Flow('requestingThread', function* () {
        yield bp.request(eventA, () => delay(3000, 'requestedEvent'));
    });

    const extendingThread = new Flow('extendingThread', function* () {
        yield [bp.extend(eventA, (x) => {
            checkFunctionIsCalled = true;
            return (x === 'requestedEvent')
        }), bp.request(eventCancel, 'cancel', () => eventA.isPending)];
        this.resolveExtend(eventA, 'extendResolved');
    });

    testScenarios((enable) => {
        enable(requestingThread);
        enable(extendingThread);
    }, [eventA, eventX, eventCancel], () => {
        if(requestingThread.isCompleted) {
            expect(eventA.value).toBe('extendResolved');
            expect(checkFunctionIsCalled).toBe(false);
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

    testScenarios((enable) => {
        enable(requestingThread);
        enable(extendingThread);
        enable(waitingThread);
    }, [eventA, eventFin], () => {
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

    testScenarios((enable) => {
        enable(requestingThread);
        enable(extendingThread);
    }, eventA, () => {
        expect(eventA.extendedBy).toBeDefined();
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

    testScenarios((enable) => {
        enable(requestingThread);
        enable(extendingThread);
        enable(extendingThreadHigherPriority); // this Flow is enabled after the first extendingThread, giving it a higher priority
        enable(waitingThread);
    }, [eventA, eventFin], () => {
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

    testScenarios((enable) => {
        enable(requestingThread);
        enable(extendingThreadOne);
        enable(extendingThreadTwo);
    }, eventA);
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


    testScenarios((enable) => {
        enable(waitingThread);
        enable(extendingThread);
    }, [eventA, eventFin], () => {
        if(eventA.isValid()) eventA.dispatch();
        else {
            expect(eventA.extendedBy).toBeDefined();
            done();
        }

    });
});

test("an extended pending event will throw an error in the extending flow if validation failed", (done) => {
    const eventA = new FlowEvent<string | undefined>('AEvent');
    const eventX = new FlowEvent<string | undefined>('EventX');
    const eventCancel = new FlowEvent<string | undefined>('cancelEvent');
    let catchByRequestingThread = false;
    let catchByExtendingThread = false;

    const requestingThread = new Flow('requestingThread', function* () {
        try {
            yield bp.request(eventA, () => failedDelay(100, 'error message'));
        }
        catch(error) {
            catchByRequestingThread = true;
        }
    });

    const extendingThread = new Flow('extendingThread', function* () {
        try {
            yield bp.extend(eventA);
        } catch(error) {
            catchByExtendingThread = true;
            expect(error).toBe('error message');
        }
        this.resolveExtend(eventA, 'extendResolved');
    });

    testScenarios((enable) => {
        enable(requestingThread);
        enable(extendingThread);
    }, [eventA, eventX, eventCancel], () => {
        if(requestingThread.isCompleted) {
            expect(catchByRequestingThread).toBe(false);
            expect(catchByExtendingThread).toBe(true);
            expect(eventA.value).toBe('extendResolved');
            done();
        }
    });
});


test("an extend can not extend its own resolve", () => {
    const eventA = new FlowEvent<string | undefined>('AEvent');
    let whileCount = 0;

    const requestingThread = new Flow('requestingThread', function* () {
        yield bp.request(eventA, 'A');
    });

    const extendThread = new Flow({name: 'extendThread'}, function* () {
        while(whileCount < 5) {
            whileCount++;
            yield bp.extend(eventA);
            this.resolveExtend(eventA, 'B');
        }
    })

    testScenarios((enable) => {
        enable(requestingThread);
        enable(extendThread);
    }, [eventA], ({log}) => {
        if(requestingThread.isCompleted) {
            expect(whileCount).toBe(2);
            expect(eventA.value).toBe('B');
        }
    });
});



test("an extend can be resolved in the catch-clause", (done) => {
    const eventA = new FlowEvent<string | undefined>('AEvent');
    let whileCount = 0;

    const requestingThread = new Flow('requestingThread', function* () {
        yield bp.request(eventA, () => failedDelay(100, 'error message'));
    });

    const exceptionHandlingThread = new Flow({name: 'handlePSI'}, function* () {
        while(whileCount < 5) {
            whileCount++;
            try {
                yield bp.extend(eventA);
                const result = this.getExtendValue(eventA);
                if(result) {
                    this.resolveExtend(eventA, 'B');
                }
            }
            catch(error) {
              this.resolveExtend(eventA, 'C');
            }
        }
    })

    testScenarios((enable) => {
        enable(requestingThread);
        enable(exceptionHandlingThread);
    }, [eventA], ({log}) => {
        if(requestingThread.isCompleted) {
            expect(whileCount).toBe(2);
            expect(eventA.value).toBe('C');
            done();
        }
    });
});

