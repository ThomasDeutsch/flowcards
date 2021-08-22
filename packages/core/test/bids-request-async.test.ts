import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { Scenario } from '../src/scenario'
import { delay } from './testutils';
import { ScenarioEvent } from "../src";


test("A function, returning a promise can be requested and will create a pending-event", (done) => {
    const eventA = new ScenarioEvent<number>('A');

    const thread1 = new Scenario('requestingThread', function* () {
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

    const eventWaitForCard = new ScenarioEvent<number>('Wait for Card');
    const eventValidateCard = new ScenarioEvent<number>('Validate Card');
    const eventLoadAccount = new ScenarioEvent<number>('Load Account');
    const eventWaitForPin = new ScenarioEvent<number>('Wait for Pin');

    let threadResetCounter = -1;

    const scenario1 = new Scenario('flow',
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

    const eventA = new ScenarioEvent('A');
    const eventB = new ScenarioEvent('B');

    const requestingScenario = new Scenario('thread1', function* () {
        yield [bp.request(eventA, () => delay(10)), bp.request(eventB, () => delay(10))];
    });

    const thread2 = new Scenario('thread2', function* () {
        yield bp.askFor(eventA);
        progressed2 = true;
    });

    const thread3 = new Scenario('thread3', function* () {
        yield bp.askFor(eventB);
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


test("if a scenario gets disabled, resolving events are ignored", (done) => {
    const eventA = new ScenarioEvent('A');
    const eventB = new ScenarioEvent('B');

    const thread1 = new Scenario('thread1', function* () {
        const progress = yield [bp.askFor(eventB),  bp.request(eventA, () => delay(100))];
        expect(progress.event).toBe(eventA);
    });

    const thread2 = new Scenario('thread2', function*() {
        yield bp.request(eventB, () => delay(200));
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
    const eventA = new ScenarioEvent('A');
    const eventB = new ScenarioEvent('B');

    const thread1 = new Scenario('requestingThread', function* () {
        yield [bp.request(eventA, () => delay(100)), bp.block(eventB)];
    });

    const thread2 = new Scenario('waitingThread', function* () {
        yield bp.askFor(eventB);
    });

    testScenarios((enable, events) => {
        events(eventA, eventB);
        enable(thread1);
        enable(thread2);
    }, () => {
        if(eventA.isPending) {
            expect(eventB.validate().isValid).toBe(false);
        } else if( thread1.isCompleted) {
            expect(eventB.validate().isValid).toBe(true);
            done();
        }
    });
});

test("a canceled request will not progress a pending event with the same event-id", (done) => {
    const eventA = new ScenarioEvent<string>('A');
    const eventB = new ScenarioEvent('B');
    const eventCancel = new ScenarioEvent('B');

    const thread1 = new Scenario('requestingThread', function* () {
        yield [bp.request(eventA, () => delay(200, '1')), bp.askFor(eventCancel)];
        yield bp.request(eventB);
        yield bp.request(eventA, () => delay(500, '2'));
        expect(eventA.value).toBe('2');
    });

    const thread2 = new Scenario('cancelThread', function* () {
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
