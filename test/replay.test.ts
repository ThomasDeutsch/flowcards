import { Flow } from "../src/flow";
import * as bp from "../src/bid";
import { delay, testScenarios } from "./testutils";
import { FlowEvent, RequestedAction, RequestedAsyncAction, ResolveAction, UIAction, UserEvent } from "../src";
import { Replay } from "../src/replay";

test("a request can be replayed", (done) => {
    const basicEvent = {
        eventA: new FlowEvent<number>('A')
    }

    const requestingFlow = new Flow('thread1', function*() {
        yield bp.request(basicEvent.eventA, 1);
    });

    const replayAction: RequestedAction = {
        id: 0,
        type: 'requestedAction',
        eventId: {name: 'A'},
        payload: 1,
        flowId: {name: 'thread1'},
        bidId: 0
    }

    const replayObj = new Replay([replayAction]);

    testScenarios((e, f) => {
        e(basicEvent)
        f(requestingFlow);
    }, ({replay}) => {
        expect(replay!.state === 'completed').toBe(true);
        done();
    }, replayObj)
});


test("if a request has no payload, the replay will use the payload from the flow", (done) => {
    const eventA = new FlowEvent<number>('A');

    const requestingFlow = new Flow('thread1', function*() {
        yield bp.request(eventA, 2);
    });

    const replayAction: RequestedAction = {
        id: 0,
        type: 'requestedAction',
        eventId: {name: 'A'},
        flowId: {name: 'thread1'},
        bidId: 0
    }

    const replayObj = new Replay([replayAction]);

    testScenarios((e, f) => {
        e(eventA);
        f(requestingFlow);
    }, ({replay}) => {
        expect(replay!.state === 'completed').toBe(true);
        expect(eventA.value).toBe(2)
        done();
    }, replayObj)
});


test("if a guard fails, the replay will be aborted", (done) => {
    const eventA = new FlowEvent<number>('A');

    const requestingFlow = new Flow('thread1', function*() {
        yield [bp.request(eventA, 2), bp.validate(eventA, (v) => v === 2)];
    });

    const replayAction: RequestedAction = {
        id: 0,
        type: 'requestedAction',
        eventId: {name: 'A'},
        flowId: {name: 'thread1'},
        bidId: 0,
        payload: 4
    }

    const replayObj = new Replay([replayAction]);

    testScenarios((e, f) => {
        e(eventA);
        f(requestingFlow);
    }, ({replay}) => {
        expect(replay!.state === 'aborted').toBe(true);
        expect(replay!.abortInfo!.error).toBe(`Guard`)
        expect(eventA.value).toBe(2)
        done();
    }, replayObj)
});


test("if a guard fails, the replay will be aborted (askFor)", (done) => {
    const eventA = new UserEvent<number>('A');

    const requestingFlow = new Flow('thread1', function*() {
        yield [bp.askFor(eventA), bp.validate(eventA, (v) => v === 2)];
    });

    const replayAction: UIAction = {
        id: 0,
        type: 'uiAction',
        eventId: {name: 'A'},
        flowId: {name: 'thread1'},
        bidId: 0,
        payload: 4
    }

    const replayObj = new Replay([replayAction]);

    testScenarios((e, f) => {
        e(eventA);
        f(requestingFlow);
    }, ({replay}) => {
        expect(replay!.state === 'aborted').toBe(true);
        expect(replay!.abortInfo!.error).toBe(`invalidReason: Guard`);
        done();
    }, replayObj)
});

test("an async request will not be send again, if a resolveAction is provided", (done) => {
    const eventA = new FlowEvent<number>('A');
    let delayFnCalled = 0;

    const requestingFlow = new Flow('thread1', function*() {
        yield bp.request(eventA, () => {
            delayFnCalled++;
            return delay(2000, 2);
        });
    });

    const replayAction1: RequestedAsyncAction = {
        id: 0,
        type: 'requestedAsyncAction',
        eventId: {name: 'A'},
        flowId: {name: 'thread1'},
        bidId: 0,
        resolveActionId: 1
    }
    const replayAction2: ResolveAction = {
        id: 1,
        type: 'resolveAction',
        eventId: {name: 'A'},
        flowId: {name: 'thread1'},
        bidId: 0,
        requestActionId: 0,
        payload: 4
    }

    const replayObj = new Replay([replayAction1, replayAction2]);

    testScenarios((e, f) => {
        e(eventA);
        f(requestingFlow);
    }, ({replay}) => {
        expect(replay!.state).toBe('completed');
        expect(eventA.value).toBe(4);
        expect(delayFnCalled).toBe(0)
        done();
    }, replayObj)
});