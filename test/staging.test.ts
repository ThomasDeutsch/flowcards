import { FlowKeyed, Flow } from "../src/flow";
import * as bp from "../src";
import { delay, testScenarios } from "./testutils";
import { FlowEvent } from "../src/event";

test("throw an error if two different flows with the same ID are enabled", () => {
    const basicEvent = {
        eventA: new FlowEvent<number>('A')
    }

    const first = new Flow('thread1', function*() {
        yield bp.request(basicEvent.eventA, 1);
    });
    const second = new Flow('thread1', function*() {
        yield bp.request(basicEvent.eventA, 2);
    });

    const updateCB = ()=> {const x = 1;};

    try {
        expect(
            testScenarios((e, f) => {
                e(basicEvent);
                f(first);
                f(second);
            }, updateCB)).toThrow('[Error: thread1 enabled more than once]')
    } catch(e) {
        const X = e;
    }
});

test("throw an error if two different events with the same ID are enabled", () => {
    const basicEvent = {
        eventA: new FlowEvent<number>('A')
    }
    const updateCB = ()=> {const x = 1;};
    try {
        expect(
            testScenarios((e, f) => {
                e(basicEvent);
                e(basicEvent);
            }, updateCB)).toThrow('event in enabled multiple times: A')
    } catch(e) {
        const X = e;
    }
});

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

    testScenarios((e, f) => {
        e([basicEvent.eventA, basicEvent.eventB])
        f(requestingThread.key(1));
    }, ()=> {
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

    testScenarios((e, f) => {
        e(eventA);
        f(requestingThread.key(1));
    }, ()=> {
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

    testScenarios((e, f) => {
        e(basicEvent);
        f(requestingThread.key(1));
    }
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

    testScenarios((e, f) => {
        e(basicEvent);
        f(requestingThread.key(1));
    }, ()=> {
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

    testScenarios((e, f, latestEvent) => {
        e([basicEvent.eventA, basicEvent.eventB]);
        latestEvents.push(latestEvent);
        f(requestingThread.key(1));
    }, ()=> {
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

    testScenarios((e, f, latestEvent) => {
        e(eventA);
        if(!requestingThread.isCompleted && latestEvent !== 'initial') {
            expect(eventA.isPending).toBe(true);
            done();
        }
        f(requestingThread);
    });
});


test("a flow gets disabled, its progress will be reset.", (done) => {

    const eventA = new FlowEvent<number>('A');
    const eventB = new FlowEvent<number>('B');
    const eventC = new FlowEvent<number>('C');


    const t1 = new Flow('thread1', function*() {
        yield bp.request(eventA, () => delay(100, 9));
        yield bp.request(eventB, () => delay(100, 9));
        yield bp.request(eventC, () => delay(100, 9));
    });
    const t2 = new Flow('thread2', function*() {
        yield bp.waitFor(eventA);
        yield bp.waitFor(eventC);
    });

    testScenarios((e, f) => {
        e([eventA, eventB, eventC]);
        f(t1);
        if(!eventB.isPending) {
            f(t2);
        }
        if(t1.isCompleted) {
            expect(t2.isCompleted).toBe(false);
            done();
        }
    });
});