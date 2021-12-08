import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { Flow } from '../src/flow'
import { delay } from './testutils';
import { FlowEvent, UserEvent } from "../src";

test("a pending event is cancelled, if the thread completes", (done) => {
    const eventA = new FlowEvent<number>('A');
    const eventB = new FlowEvent<number>('B');

    const requestingThread = new Flow('thread1', function*() {
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
    const eventA = new FlowEvent<number | undefined>('Axxl');

    const thread1 = new Flow('requestingThread', function* () {
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


test("for multiple active promises in one yield, only one resolve will progress the Flow", (done) => {
    let progressed2 = false;
    let progressed3 = false;

    const eventA = new FlowEvent('A');
    const eventB = new FlowEvent('B');

    const requestingScenario = new Flow('thread1', function* () {
        yield [bp.request(eventA, () => delay(10)), bp.request(eventB, () => delay(10))];
    });

    const thread2 = new Flow('thread2', function* () {
        yield bp.waitFor(eventA);
        progressed2 = true;
    });

    const thread3 = new Flow('thread3', function* () {
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
    const eventA = new FlowEvent('A');
    const eventB = new FlowEvent('B');

    const thread1 = new Flow('thread1', function* () {
        const progress = yield [bp.waitFor(eventB),  bp.request(eventA, () => delay(100))];
        expect(progress.event).toBe(eventA);
    });

    const thread2 = new Flow('thread2', function*() {
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
    const eventA = new FlowEvent('A');
    const eventB = new UserEvent('B');

    const thread1 = new Flow('requestingThread', function* () {
        yield [bp.request(eventA, () => delay(100)), bp.block(eventB)];
    });

    const thread2 = new Flow('waitingThread', function* () {
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
    const eventA = new FlowEvent<string | undefined>('A');
    const eventB = new FlowEvent('B');
    const eventCancel = new UserEvent('B');

    const thread1 = new Flow('requestingThread', function* () {
        yield [bp.request(eventA, () => delay(200, '1')), bp.askFor(eventCancel)];
        yield bp.request(eventB);
        yield bp.request(eventA, () => delay(500, '2'));
        expect(eventA.value).toBe('2');
    });

    const thread2 = new Flow('cancelThread', function* () {
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
