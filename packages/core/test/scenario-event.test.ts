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


test("an event value is reset to its initial value on disable", () => {
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
            eventA.disable(); // true = reset value
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


test("an event can not be dispatched during staging", () => {
    const eventA = new ScenarioEvent<number>('A');

    const requestingThread = new Scenario('thread1', function*() {
        yield bp.askFor(eventA);
    });

    testScenarios((enable, event) => {
        event(eventA);
        expect(eventA.dispatch(1)).toBe(false);
        expect(eventA.validate(1).isValid).toBe(false);
        expect(eventA.validate(1).failed[0].type).toEqual('notAllowedDuringStaging');
        enable(requestingThread);
    });
});


test("an event can not be dispatched during bThread progress", () => {
    const eventA = new ScenarioEvent<number>('A');

    const requestingThread = new Scenario('thread1', function*() {
        yield bp.request(eventA);
        expect(eventA.dispatch(1)).toBe(false);
        expect(eventA.validate(1).isValid).toBe(false);
        expect(eventA.validate(1).failed.length).toBe(1);
        expect(eventA.validate(1).failed[0].type).toEqual('betweenBids');
        yield bp.askFor(eventA);
    });

    testScenarios((enable, event) => {
        event(eventA);
        enable(requestingThread);
    });
});


test("an event that is not enabled can not be dispatched", () => {
    const eventA = new ScenarioEvent<number>('A');

    const requestingThread = new Scenario('thread1', function*() {
        yield bp.askFor(eventA);
    });

    testScenarios((enable) => {
        enable(requestingThread);
    },() => {
        expect(eventA.validate(1).isValid).toBe(false);
        expect(eventA.validate(1).failed[0].type).toBe('eventNotEnabled')

    });
});



// TODO: is this a good idea? - not sure
// 1. (cons) a validation at this level is almost without context.
// 2. (pros) before a validation is repeated over multiple bids, it may be better to have a global validation
// 3. (cons) instead of a global validation it might be a better idea to have a validate-bid ?

// test("an event can have an additional validate function", () => {
//     const eventA = new ScenarioEvent<number>('A', 10);

//     const acceptedRequestScenario = new Scenario('acceptedRequestScenario', function*() {
//         yield bp.request(eventA, 9);
//     });

//     const failingRequestScenario = new Scenario('failingRequestScenario', function*() {
//         yield bp.request(eventA, 11);
//     });

//     testScenarios((enable, events) => {
//         events(eventA);
//         enable(acceptedRequestScenario);
//         enable(failingRequestScenario);
//     }, ()=> {
//         expect(eventA.value).toBe(11);
//     });
// });
