import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { BThread } from '../src/b-thread'
import { delay } from './testutils';
import { TEvent, UEvent } from "../src";

test("a pending event is cancelled, if the thread completes", (done) => {
    const eventA = new TEvent<number | undefined>('A');
    const eventB = new TEvent<number | undefined>('B');

    const requestingThread = new BThread('thread1', function*() {
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

test("A function, returning a promise can be requested and will create a pending-event", (done) => {
    const eventA = new TEvent<number | undefined>('Axxl');

    const thread1 = new BThread('requestingThread', function* () {
        yield bp.request(eventA, () => delay(10, 10));
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
    }, () => {
        if(thread1.isCompleted) {
            expect(eventA.value).toBe(10);
            done();
        } else if (eventA.isPending) {
            expect(thread1.isCompleted).toBe(false);
        }
    });
});


test("multiple async-requests can be executed sequentially", (done) => {

    const eventWaitForCard = new TEvent<number | undefined>('Wait for Card');
    const eventValidateCard = new TEvent<number | undefined>('Validate Card');
    const eventLoadAccount = new TEvent<number | undefined>('Load Account');
    const eventWaitForPin = new TEvent<number | undefined>('Wait for Pin');

    let threadResetCounter = -1;

    const scenario1 = new BThread('flow',
        function*() {
            threadResetCounter++;
            yield bp.request(eventWaitForCard, () => delay(10, 1));
            yield bp.request(eventValidateCard, () => delay(10, 2));
            yield bp.request(eventLoadAccount, () => delay(10, 3));
            yield bp.request(eventWaitForPin, () => delay(10, 4));
        }
    );

    testScenarios((enable,events) => {
        events(eventWaitForCard, eventValidateCard, eventLoadAccount, eventWaitForPin);
        enable(scenario1);
    }, (() => {
        if(scenario1.isCompleted) {
            expect(threadResetCounter).toEqual(0);
            done();
        }
    }));
});


test("for multiple active promises in one yield, only one resolve will progress the BThread", (done) => {
    let progressed2 = false;
    let progressed3 = false;

    const eventA = new TEvent('A');
    const eventB = new TEvent('B');

    const requestingScenario = new BThread('thread1', function* () {
        yield [bp.request(eventA, () => delay(10)), bp.request(eventB, () => delay(10))];
    });

    const thread2 = new BThread('thread2', function* () {
        yield bp.waitFor(eventA);
        progressed2 = true;
    });

    const thread3 = new BThread('thread3', function* () {
        yield bp.waitFor(eventB);
        progressed3 = true;
    });

    testScenarios((enable, events) => {
        events(eventA, eventB);
        enable(requestingScenario);
        enable(thread2);
        enable(thread3);
    }, () => {
        if(requestingScenario.isCompleted) {
            expect(progressed2).not.toBe(progressed3);
            done();
        }
    });
});


test("if a scenario gets disabled, pending events will be canceled", (done) => {
    const eventA = new TEvent('A');
    const eventB = new TEvent('B');

    const thread1 = new BThread('thread1', function* () {
        const progress = yield [bp.waitFor(eventB),  bp.request(eventA, () => delay(100))];
        expect(progress.event).toBe(eventA);
    });

    const thread2 = new BThread('thread2', function*() {
        yield bp.request(eventB, () => delay(2000));
    });

    testScenarios((enable, events) => {
        events(eventA, eventB)
        enable(thread1);
        if(eventA.isPending) {
            enable(thread2);
        }
    }, () => {
        if(thread1.isCompleted) {
            expect(eventB.isPending).toBe(false);
            done();
        }
    });
});


test("a scenario in a pending-event state can place additional bids.", (done) => {
    const eventA = new TEvent('A');
    const eventB = new UEvent('B');

    const thread1 = new BThread('requestingThread', function* () {
        yield [bp.request(eventA, () => delay(100)), bp.block(eventB)];
    });

    const thread2 = new BThread('waitingThread', function* () {
        yield bp.askFor(eventB);
    });

    testScenarios((enable, events) => {
        events(eventA, eventB);
        enable(thread1);
        enable(thread2);
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
    const eventA = new TEvent<string | undefined>('A');
    const eventB = new TEvent('B');
    const eventCancel = new UEvent('B');

    const thread1 = new BThread('requestingThread', function* () {
        yield [bp.request(eventA, () => delay(200, '1')), bp.askFor(eventCancel)];
        yield bp.request(eventB);
        yield bp.request(eventA, () => delay(500, '2'));
        expect(eventA.value).toBe('2');
    });

    const thread2 = new BThread('cancelThread', function* () {
        yield bp.trigger(eventCancel);
    });

    testScenarios((enable, event) => {
        event(eventA, eventB, eventCancel);
        enable(thread1);
        enable(thread2);
    }, () => {
        if(thread1.isCompleted) {
            done();
        }
    });
});
