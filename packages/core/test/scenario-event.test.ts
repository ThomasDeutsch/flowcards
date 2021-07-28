import * as bp from "../src/bid";
import { delay, testScenarios } from "./testutils";
import { ScenarioEvent } from "../src/scenario-event";
import { Scenario } from "../src";

interface ScenarioProps {
    a: number
}

test("an event needs to be enabled in order to be requested", () => {
    const eventA = new ScenarioEvent<number>('A');
    const eventB = new ScenarioEvent<number>('B');

    const requestingThread = new Scenario<ScenarioProps>('thread1', function*() {
        yield bp.request(eventA);
        yield bp.request(eventB);
    });

    testScenarios((enable, event) => {
        event(eventA);
        enable(requestingThread, {a: 1});
    }, ()=> {
        expect(eventB.isEnabled).toBe(false)
        expect(requestingThread.isCompleted).toBe(false)
    });
});


test("an event value can be reset to its initial value on disable", () => {
    const eventA = new ScenarioEvent<number>('A', 10);
    const eventB = new ScenarioEvent('B');

    const requestingThread = new Scenario<ScenarioProps>('thread1', function*() {
        yield bp.request(eventA, 20);
        yield bp.request(eventB);
    });

    testScenarios((enable, event) => {
        event(eventA, eventB);
        enable(requestingThread, {a: 1});
        if(requestingThread.isCompleted) {
            eventA.disable(true); // true = reset value
        }
    }, ()=> {
        expect(eventB.isEnabled).toBe(true);
        expect(requestingThread.isCompleted).toBe(true);
        expect(eventA.value).toEqual(10);
    });
});

test("after an event progressed, it is not pending any longer", (done) => {
    const eventA = new ScenarioEvent<number>('A');

    const requestingThread = new Scenario('thread1', function*() {
        yield bp.request(eventA, () => delay(100, 1));
        expect(eventA.isPending).toBe(false);
        done();
    });

    testScenarios((enable, event) => {
        event(eventA);
        enable(requestingThread);
    });
});

test("after an event progressed, it is not dispatch-able until the next bids are calculated", () => {
    const eventA = new ScenarioEvent<number>('A');
    const eventB = new ScenarioEvent<number>('B');

    const requestingThread = new Scenario('thread1', function*() {
        const progress = yield [bp.request(eventA), bp.askFor(eventB)];
        expect(progress.event).toBe(eventA);
        expect(eventB.validate().isValid).toBe(false);
        expect(eventB.validate().failed[0].type).toBe('betweenBids');
        yield bp.request(eventB);
    });

    testScenarios((enable, event) => {
        event(eventA, eventB);
        enable(requestingThread);
    });
});

// TODO: is this a good idea?
// test("an event can have an additional validate function", () => {
//     const eventA = new ScenarioEvent<number>('A', 10);

//     const requestingThread = scenario({id: 'thread1'}, function*() {
//         yield bp.request(eventA, (a) => (a || 0) + 1);
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread());
//     }, ()=> {
//         expect(eventA.value).toBe(11);
//     });
// });
