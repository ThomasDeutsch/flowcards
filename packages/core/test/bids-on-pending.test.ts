import * as bp from "../src/index";
import { testScenarios, delay } from "./testutils";
import { Scenario } from '../src/scenario';
import { ScenarioEvent, ScenarioEventKeyed } from "../src/index";


test("an onPending-wait is progressed, when the event receives the pending state", (done) => {

    const testEvents = {
        A: new ScenarioEvent<string>('A')
    }

    const thread1 = new Scenario('thread1', function* () {
        yield bp.request(testEvents.A, () => delay(100, "hey"));
    })

    const thread2 = new Scenario('thread2', function* () {
        yield bp.onPending(testEvents.A);
    })

    testScenarios((enable, events) => {
        events(testEvents.A);
        enable(thread1);
        enable(thread2);
    }, () => {
        if(testEvents.A.isPending) {
            expect(thread2.isCompleted).toBe(true);
            expect(thread1.isCompleted).toBe(false);
            done();
        }
    });
});


test("an onPending-wait is not progressed on events that are not async", () => {
    const testEvents = {
        A: new ScenarioEvent<string>('A')
    }

    const thread1 = new Scenario('thread1', function* () {
        yield bp.request(testEvents.A, "hey");
    })

    const thread2 = new Scenario('thread2', function* () {
        yield bp.onPending(testEvents.A);
    })

    testScenarios((enable, events) => {
        events(testEvents.A);
        enable(thread1);
        enable(thread2);
    }, () => {
        expect(thread2.isCompleted).toBeFalsy();
    });
});

test("an onPending for a keyed event is not progressed when a no-key request for the same event-name is made", (done) => {

    const testEvents = {
        A: new ScenarioEvent<string>('A'),
        AK: new ScenarioEventKeyed<string>('A')
    }

    const thread1 = new Scenario('thread1', function* () {
        yield bp.request(testEvents.A, () => delay(100, "hey"));
    })

    const thread2 = new Scenario('thread2', function* () {
        yield bp.onPending(testEvents.AK.key(1));
    })

    testScenarios((enable, events) => {
        events(testEvents.A, ...testEvents.AK.keys(1));
        enable(thread1);
        enable(thread2);
    }, () => {
        if(testEvents.A.isPending) {
            expect(thread2.isCompleted).toBe(false);
            done();
        }
    });
});
