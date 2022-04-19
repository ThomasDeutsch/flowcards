import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { FlowEvent, UserEvent } from "../src/event";
import { Flow } from "flow";


test("an event needs to be enabled in order to be requested", () => {
    const eventA = new FlowEvent<number>('A');
    const eventB = new FlowEvent<number>('B');

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventA);
        yield bp.request(eventB);
    });

    testScenarios((enable) => {
        enable(requestingThread);
    }, eventA, ()=> {
        expect(eventB.isConnected).toBe(false)
        expect(requestingThread.isCompleted).toBe(false)
    });
});


test("a dispatch returns a validation result, if the dispatch was valid", (done) => {
    const eventA = new UserEvent<number>('A');

    const askingScenario = new Flow('thread1', function*() {
        const x = yield* bp.bid(bp.askFor(eventA));
        expect(x).toBe(100);
    });

    testScenarios((enable) => {
        enable(askingScenario);
    }, eventA, () => {
        if(eventA.isValid(100)) {
            eventA.dispatch(100).then(result => {
                expect(result.isValid).toBe(true);
                done();
            });
        }
    });
});


test("the dispatch promise returns false, if another event has made the dispatch invalid.", (done) => {
    const eventA = new UserEvent<number>('A');

    const askingScenario = new Flow('thread1', function*() {
        yield bp.askFor(eventA);
    });

    testScenarios((enable) => {
        enable(askingScenario);
    }, eventA, () => {
        eventA.dispatch(100);
        eventA.dispatch(100).then((result) => {
            expect(result.isValid).toBe(false);
            expect(result.askForBid).toBeUndefined();
            done();
        });
    });
});


test("an event that is not enabled can not be dispatched", () => {
    const eventA = new UserEvent<number>('A');

    const requestingThread = new Flow('thread1', function*() {
        yield bp.askFor(eventA);
    });

    testScenarios((enable) => {
        enable(requestingThread);
    }, [],() => {
        expect(eventA.isValid(1)).toBe(false);
        expect(eventA.isConnected).toBe(false);
    });
});


test("in a validate function, the event.value represents its old value", () => {
    const eventA = new FlowEvent<number>('A');

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventA, 1);
        yield bp.request(eventA, 2);
    });

    const validatingThread = new Flow('thread2', function*() {
        const val = yield* bp.bid(bp.waitFor(eventA));
        expect(val).toBe(1);
        yield bp.validate(eventA, (nextVal) => {
            expect(nextVal).toBe(2);
            expect(eventA.value).toBe(1);
            return true;
        });
    });

    testScenarios((enable) => {
        enable(requestingThread);
        enable(validatingThread);

    }, eventA);
});
