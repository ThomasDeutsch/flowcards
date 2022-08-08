import * as bp from "../src/bid";
import { failedDelay, testScenarios } from "./testutils";
import { Flow } from '../src/flow'
import { delay } from './testutils';
import { FlowEvent, UserEvent } from "../src/event";


test("an async request is not called if proceeded by a not-async request", (done) => {
    const eventA = new FlowEvent<number>('syncEvent');
    const eventB = new FlowEvent<number>('asyncEvent');

    const requestingThread = new Flow('thread1', function*() {
        yield [bp.request(eventA, 1), bp.request(eventB, () => delay(200, 1))];
    })

    testScenarios((e, f) => {
        e([eventA, eventB]);
        f(requestingThread);
    }, ({info})=> {
        if(requestingThread.isCompleted) {
            expect(eventB.pendingBy).toBe(undefined);
            expect(info.logs[info.logs.length-1].canceled.length).toBe(0);
            done();
        }
        else {
            expect(eventB.pendingBy?.name).toBe('thread1');
        }
    });
});


test("a pending event is cancelled, if the thread completes", (done) => {
    const eventA = new FlowEvent<number>('syncEvent');
    const eventB = new FlowEvent<number>('asyncEvent');

    const requestingThread = new Flow('thread1', function*() {
        yield [bp.request(eventB, () => delay(200, 1)), bp.request(eventA, 1)];
    })

    testScenarios((e, f) => {
        e([eventA, eventB]);
        f(requestingThread);
    }, ({info})=> {
        if(requestingThread.isCompleted) {
            expect(eventB.pendingBy).toBe(undefined);
            expect(info.logs[info.logs.length-1].canceled[0].eventId.name === 'asyncEvent')
            done();
        }
        else {
            expect(eventB.pendingBy?.name).toBe('thread1');
        }
    });
});


test("A function, returning a promise can be requested and will create a pending-event", (done) => {
    const eventA = new FlowEvent<number | undefined>('TEST12222');

    const thread1 = new Flow('requestingThread', function* () {
        yield bp.request(eventA, () => delay(100, 10));
    });

    testScenarios((e, f) => {
        e(eventA);
        f(thread1);
    }, ({info}) => {
        if(thread1.isCompleted) {
            expect(eventA.value).toBe(10);
            const l = info.logs[info.logs.length-1];
            expect(l.explain.map(e => e.invalidReason)[0]).toBe(undefined)
            done();
        } else if (eventA.pendingBy) {
            expect(thread1.isCompleted).toBe(false);
        }
    });
});


test("multiple async-requests can be executed sequentially", (done) => {

    const eventWaitForCard = new FlowEvent<number | undefined>('Wait for Card');
    const eventValidateCard = new FlowEvent<number | undefined>('Validate Card');
    const eventLoadAccount = new FlowEvent<number | undefined>('Load Account');
    const eventWaitForPin = new FlowEvent<number | undefined>('Wait for Pin');

    let threadResetCounter = -1;

    const scenario1 = new Flow('flow',
        function*() {
            threadResetCounter++;
            yield bp.request(eventWaitForCard, () => delay(10, 1));
            yield bp.request(eventValidateCard, () => delay(10, 2));
            yield bp.request(eventLoadAccount, () => delay(10, 3));
            yield bp.request(eventWaitForPin, () => delay(10, 4));
        }
    );

    testScenarios((e, f) => {
        e([eventWaitForCard, eventLoadAccount, eventValidateCard, eventWaitForPin]);
        f(scenario1);
    }, (() => {
        if(scenario1.isCompleted) {
            expect(threadResetCounter).toEqual(0);
            done();
        }
    }));
});


test("for multiple active promises in one yield, only one resolve will progress the Flow", (done) => {
    let progressed2 = false;
    let progressed3 = false;

    const eventA = new FlowEvent('A');
    const eventB = new FlowEvent('B');

    const requestingScenario = new Flow('thread1', function* () {
        yield [bp.request(eventA, () => delay(10, undefined)), bp.request(eventB, () => delay(10, undefined))];
    });

    const thread2 = new Flow('thread2', function* () {
        yield bp.waitFor(eventA);
        progressed2 = true;
    });

    const thread3 = new Flow('thread3', function* () {
        yield bp.waitFor(eventB);
        progressed3 = true;
    });

    testScenarios((e, f) => {
        e([eventA, eventB]);
        f(requestingScenario);
        f(thread2);
        f(thread3);
    }, () => {
        if(requestingScenario.isCompleted) {
            expect(progressed2).not.toBe(progressed3);
            done();
        }
    });
});


test("if a scenario gets disabled, pending events will be canceled", (done) => {
    const eventA = new FlowEvent('A');
    const eventB = new FlowEvent('Bxxl');

    const thread1 = new Flow('thread1', function* () {
        const progress = yield [bp.waitFor(eventB),  bp.request(eventA, () => delay(100, undefined))];
        expect(progress.event).toBe(eventA);
    });

    const thread2 = new Flow('thread2x', function*() {
        yield bp.request(eventB, () => delay(2000, undefined));
    });

    testScenarios((e, f) => {
        e([eventA, eventB]);
        f(thread1);
        if(eventA.isPending) {
            f(thread2);
        }
    }, () => {
        if(thread1.isCompleted) {
            expect(eventB.isPending).toBe(false);
            done();
        }
    });
});


test("a scenario in a pending-event state can place additional bids.", (done) => {
    const eventA = new FlowEvent('A');
    const eventB = new UserEvent('B');

    const thread1 = new Flow('requestingThread', function* () {
        yield [bp.request(eventA, () => delay(100, undefined)), bp.validate(eventB, () => false)];
    });

    const thread2 = new Flow('waitingThread', function* () {
        yield bp.askFor(eventB);
    });

    testScenarios((e, f) => {
        e([eventA, eventB]);
        f(thread1);
        f(thread2);
    }, () => {
        if(eventA.isPending) {
            expect(eventB.isValid()).toBe(false);
        }
        if(thread1.isCompleted) {
            expect(eventB.isValid()).toBe(true);
            done();
        }
    });
});

test("a canceled request will not progress a pending event with the same event-id", (done) => {
    const eventA = new FlowEvent<string | undefined>('A');
    const eventB = new FlowEvent('B');
    const eventCancel = new UserEvent('C');

    const thread1 = new Flow('requestingThread', function* () {
        yield [bp.request(eventA, () => delay(200, '1')), bp.askFor(eventCancel)];
        yield bp.request(eventB);
        yield bp.request(eventA, () => delay(500, '2'));
        expect(eventA.value).toBe('2');
    });

    const thread2 = new Flow('cancelThread', function* () {
        yield bp.trigger(eventCancel);
    });

    testScenarios((e, f) => {
        e([eventA, eventB, eventCancel]);
        f(thread1);
        f(thread2);
    }, () => {
        if(thread1.isCompleted) {
            done();
        }
    });
});

test("a failed async request will throw", (done) => {
    const asyncEvent = new FlowEvent<string>('asyncEvent');

    const requestingThread = new Flow('thread1', function*() {
        try {
            yield bp.request(asyncEvent, () => failedDelay(200, 'request failed'));
        } catch(error) {
            expect(error).toBe('request failed');
        }
    })

    testScenarios((e, f) => {
        e([asyncEvent]);
        f(requestingThread);
    }, ()=> {
        if(requestingThread.isCompleted) {
            expect(asyncEvent.isPending).toBe(false);
            done();
        }
    });
});

test("a failed async request validation will throw", (done) => {
    const asyncEvent = new FlowEvent<string>('asyncEvent123', 'not set');
    let validationFunctionCalled = false;

    const requestingThread = new Flow('thread1', function*() {
        try {
            yield [bp.request(asyncEvent, () => delay(200, 'wrong result'), () => {
                validationFunctionCalled = true;
                return true;
            }), bp.validate(asyncEvent, () => ["this is invalid"])];
        } catch(error: any) {
            expect(error.invalidReason).toBe('Guard');
        }
    })

    testScenarios((e, f) => {
        e([asyncEvent]);
        f(requestingThread);
    }, ()=> {
        if(requestingThread.isCompleted) {
            expect(asyncEvent.isPending).toBe(false);
            expect(validationFunctionCalled).toBe(true);
            expect(asyncEvent.value).toBe('not set');
            done();
        }
    });
});


test("a request is cancelled if the bid is not repeated", (done) => {
    const asyncEvent = new FlowEvent<string>('asyncEvent', 'not set');
    const cancelEvent = new FlowEvent<undefined>('cancelEvent');
    const finEvent = new UserEvent<string>('finEvent');

    const requestingThread = new Flow('thread1', function*() {
        const progress = yield [bp.request(asyncEvent, () => delay(200, 'VALUE')), bp.request(cancelEvent)];
        expect(progress.event).toBe(cancelEvent);
        yield bp.askFor(finEvent);
    })

    testScenarios((e, f) => {
        e([asyncEvent, cancelEvent, finEvent]);
        f(requestingThread);
    }, ()=> {
        if(finEvent.isValid('test')) {
            expect(asyncEvent.isPending).toBe(false);
            expect(asyncEvent.value).toBe('not set');
            done();
        }
    });
});


test("a request is resumed if the placed bid is repeated", (done) => {
    const asyncEvent = new FlowEvent<string>('asyncEvent', 'not set');
    const cancelEvent = new FlowEvent<undefined>('cancelEvent');
    const finEvent = new UserEvent<string>('finEvent');

    const requestingThread = new Flow('thread1', function*() {
        const progress = yield [bp.request(asyncEvent, () => delay(200, 'Next Value')), bp.request(cancelEvent)];
        expect(progress.event).toBe(cancelEvent);
        yield progress.remainingBids;
    });

    testScenarios((e, f) => {
        e([asyncEvent, cancelEvent, finEvent]);
        f(requestingThread);
    }, ()=> {
        if(requestingThread.isCompleted) {
            expect(asyncEvent.isPending).toBe(false);
            expect(asyncEvent.value).toBe('Next Value');
            done();
        }
    });
});

test("a request is resumed if the bid is repeated - and it needs to be the same placed bid", (done) => {
    const asyncEvent = new FlowEvent<string>('asyncEvent', 'not set');
    const cancelEvent = new FlowEvent<undefined>('cancelEvent');
    const finEvent = new UserEvent<string>('finEvent');

    const requestingThread = new Flow('thread1', function*() {
        const progress = yield [bp.request(asyncEvent, () => delay(200, 'async value')), bp.request(cancelEvent)];
        expect(progress.event).toBe(cancelEvent);
        yield bp.request(asyncEvent, () => 'sync value');
    });

    testScenarios((e, f) => {
        e([asyncEvent, cancelEvent, finEvent]);
        f(requestingThread);
    }, ({info})=> {
        if(requestingThread.isCompleted) {
            expect(asyncEvent.isPending).toBe(false);
            expect(asyncEvent.value).toBe('sync value');
            expect(info.logs[1].canceled[0]?.eventId.name).toBe('asyncEvent');
            done();
        }
    });
});


test("A block will block the async-call", (done) => {
    const eventA = new FlowEvent<number | undefined>('Axxl');
    let promiseCreated = false

    const thread1 = new Flow('requestingThread', function* () {
        yield [bp.request(eventA, () => {
            promiseCreated = true
            return delay(100, 10)
        }), bp.block(eventA, () => true)];
    });

    testScenarios((e, f) => {
        e(eventA);
        f(thread1);
    }, () => {
        expect(promiseCreated).toBe(false);
        expect(eventA.isBlocked).toBe(true);
        expect(eventA.isPending).toBe(false);
        done();
    });
});

test("a failed guard for a request will block the validation function from being called", () => {
    const asyncEvent = new FlowEvent<string>('asyncEvent888', 'not set');
    let serviceCalled = 0;
    let validationFunctionCalled = false;

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(asyncEvent, () => {
            serviceCalled++;
            return delay(200, 'wrong result')
        }, () => {
            validationFunctionCalled = true;
            return false;
        });
    })

    testScenarios((e, f) => {
        e([asyncEvent]);
        f(requestingThread);
    }, ()=> {
        expect(requestingThread.isCompleted).toBe(false);
        expect(asyncEvent.isPending).toBe(false);
        expect(serviceCalled).toBe(0);
        expect(validationFunctionCalled).toBe(true);
    });
});