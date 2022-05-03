import { FlowKeyed, Flow } from "../src/flow";
import * as bp from "../src";
import { delay, testScenarios } from "./testutils";
import { FlowEvent } from "../src/event";


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


test("a latestEvent parameter is the second argument", () => {

    const basicEvent = {
        eventA: new FlowEvent<number>('A'),
        eventB: new FlowEvent<number>('B')
    }

    const latestEvents: (bp.UserEvent<any,any> | bp.FlowEvent<any,any> | 'initial')[] = []

    const requestingThread = new FlowKeyed('thread1', function*() {
        yield bp.request(basicEvent.eventA, 1);
        yield bp.request(basicEvent.eventB, 1);
    });

    testScenarios((s, latestEvent) => {
        latestEvents.push(latestEvent);
        s(requestingThread.key(1));
    }, [basicEvent.eventA, basicEvent.eventB]
    ,()=> {
        expect(latestEvents.length).toBe(3);
        expect(latestEvents[0]).toEqual('initial');
        expect(latestEvents[1]).toBe(basicEvent.eventA);
        expect(latestEvents[2]).toBe(basicEvent.eventB);
        expect(requestingThread.key(1).isCompleted).toBe(true);
    });
});


test("a pending event is shown as pending in the staging function", (done) => {

    const eventA = new FlowEvent<number>('A')

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventA, () => delay(200, 1));
    });

    testScenarios((enable, latestEvent) => {
        if(!requestingThread.isCompleted && latestEvent !== 'initial') {
            expect(eventA.isPending).toBe(true);
            done();
        }
        enable(requestingThread);
    }, eventA);
});