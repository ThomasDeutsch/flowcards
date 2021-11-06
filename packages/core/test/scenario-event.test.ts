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
        expect(eventB.isConnected).toBe(false)
        expect(requestingThread.isCompleted).toBe(false)
    });
});


test("an event value is reset to its initial value on unplug", () => {
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
            eventA.__unplug();
        }
    }, ()=> {
        expect(eventB.isConnected).toBe(true);
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

test("a dispatch returns a validation result, if the dispatch was valid", (done) => {
    const eventA = new ScenarioEvent<number>('A');

    const askingScenario = new Scenario('thread1', function*() {
        const x = yield* bp.bid(bp.askFor(eventA));
        expect(x).toBe(100);
        done();
    });

    testScenarios((enable, event) => {
        event(eventA);
        enable(askingScenario);
    }, () => {
        if(eventA.isValid(100)) {
            eventA.dispatch(100)
        }
    });
});

// test("the dispatch promise returns false, if another event has made the dispatch invalid.", (done) => {
//     const eventA = new ScenarioEvent<number>('A');

//     const askingScenario = new Scenario('thread1', function*() {
//         yield bp.askFor(eventA);
//     });

//     const blockingScenario = new Scenario('thread2', function*() {
//         yield bp.block(eventA);
//     });

//     testScenarios((enable, event) => {
//         event(eventA);
//         enable(askingScenario);
//         enable(blockingScenario);
//     }, () => {
//         eventA.dispatch(100).then((result) => {
//             expect(result.failed[0].type).toBe('blocked');
//             askingScenario.isCompleted === false;
//             done();
//         });
//     });
// });


test("an event that is not enabled can not be dispatched", () => {
    const eventA = new ScenarioEvent<number>('A');

    const requestingThread = new Scenario('thread1', function*() {
        yield bp.askFor(eventA);
    });

    testScenarios((enable) => {
        enable(requestingThread);
    },() => {
        expect(eventA.isValid(1)).toBe(false);
        expect(eventA.isConnected).toBe(false);

    });
});


//TODO: dispatch pending
//TODO: nextDispatch
