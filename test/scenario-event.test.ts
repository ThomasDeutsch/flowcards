import * as bp from "../src/bid";
import { delay, testScenarios } from "./testutils";
import { FlowEvent, UserEvent } from "../src/event";
import { Flow } from "../src/flow";


test("an event needs to be enabled in order to be requested", () => {
    const eventA = new FlowEvent<number>('A');
    const eventB = new FlowEvent<number>('B');

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventA);
        yield bp.request(eventB);
    });

    testScenarios((e, f) => {
        e(eventA);
        f(requestingThread);
    }, ()=> {
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

    testScenarios((e, f) => {
        e(eventA);
        f(askingScenario);
    }, () => {
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

    testScenarios((e, f) => {
        e(eventA);
        f(askingScenario);
    }, () => {
        eventA.dispatch(100);
        eventA.dispatch(100).then((result) => {
            expect(result.isValid).toBe(false);
            expect(result.askForBid).toBeUndefined();
            done();
        });
    });
});


test("an event that is not connected can not be dispatched", () => {
    const eventA = new UserEvent<number>('A');

    const requestingThread = new Flow('thread1', function*() {
        yield bp.askFor(eventA);
    });

    testScenarios((e, f) => {
        f(requestingThread);
    },() => {
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

    testScenarios((e, f) => {
        e(eventA);
        f(requestingThread);
        f(validatingThread);
    });
});


test("a callback on value change can be registered", () => {
    const eventA = new UserEvent<number>('A');
    let callbackValue: number | undefined = -1;
    let callbackCalled = 0;
    eventA.registerCallback((value) => {
        callbackValue = value;
        callbackCalled++;
    })

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventA, 1000);
    });

    testScenarios((e, f) => {
        e(eventA);
        f(requestingThread);
    },() => {
        expect(callbackValue).toBe(1000);
        expect(callbackCalled).toBe(1);
    });
});


test("if an event is extended, it will register as pending", () => {
    const eventA = new UserEvent<number>('A');

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventA, 1000);
    });
    const extendingThread = new Flow('thread2', function*() {
        yield bp.extend(eventA);
    });

    testScenarios((e, f) => {
        e(eventA);
        f(requestingThread);
        f(extendingThread);
    }, () => {
        expect(eventA.isPending).toBe(true)
    });
});


test("if an event is disconnected, the value is undefined", () => {
    const eventA = new UserEvent<number>('A', 0);

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventA, 1000);
    });

    testScenarios((e, f) => {
        f(requestingThread);
        if(!requestingThread.isCompleted) {
            e(eventA);
        }
    },() => {
        expect(eventA.value).toBe(undefined);
    });
});

test("the event initial value can be a function", () => {
    const eventA = new UserEvent<number>('A', () => 1);

    const t1 = new Flow('thread1', function*() {
        yield bp.waitFor(eventA);
    });

    testScenarios((e, f) => {
        e(eventA)
        f(t1);
    },() => {
        expect(eventA.value).toBe(1);
    });
});

