import { FlowKeyed } from "../src/flow";
import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { FlowEvent } from "event";


test("events can be passed as an array", () => {

    const basicEvent = {
        eventA: new FlowEvent<number>('A'),
        eventB: new FlowEvent<number>('B')
    }

    const requestingThread = new FlowKeyed('thread1', function*() {
        const progress = yield bp.request(basicEvent.eventA, 1);
        expect(progress.event).toBe(basicEvent.eventA);
        expect(this.key).toBe(1);
    });

    testScenarios((s) => {
        s(requestingThread.key(1));
    }, [basicEvent.eventA, basicEvent.eventB]
    ,()=> {
        expect(requestingThread.key(1).isCompleted).toBe(true);
    });
});

test("a single event can be provided", () => {

    const eventA = new FlowEvent<number>('A');

    const requestingThread = new FlowKeyed('thread1', function*() {
        const progress = yield bp.request(eventA, 1);
        expect(progress.event).toBe(eventA);
        expect(this.key).toBe(1);
    });

    testScenarios((s) => {
        s(requestingThread.key(1));
    }, eventA, ()=> {
        expect(requestingThread.key(1).isCompleted).toBe(true);
    });
});

test("events can be passed as an object", () => {

    const basicEvent = {
        eventA: new FlowEvent<number>('A'),
        eventB: new FlowEvent<number>('B')
    }

    const requestingThread = new FlowKeyed('thread1', function*() {
        const progress = yield bp.request(basicEvent.eventA, 1);
        expect(progress.event).toBe(basicEvent.eventA);
        expect(this.key).toBe(1);
    });

    testScenarios((s) => {
        s(requestingThread.key(1));
    }, basicEvent
    ,()=> {
        expect(requestingThread.key(1).isCompleted).toBe(true);
    });
});

test("events can be inside a nested object", () => {

    const basicEvent = { inner: {
        eventA: new FlowEvent<number>('A'),
        eventB: new FlowEvent<number>('B')
    }}

    const requestingThread = new FlowKeyed('thread1', function*() {
        const progress = yield bp.request(basicEvent.inner.eventA, 1);
        expect(progress.event).toBe(basicEvent.inner.eventA);
        expect(this.key).toBe(1);
    });

    testScenarios((s) => {
        s(requestingThread.key(1));
    }, basicEvent
    ,()=> {
        expect(requestingThread.key(1).isCompleted).toBe(true);
    });
});