import { Scenario, Scenarios } from "../src";
import * as bp from "../src/bid";
import { ScenarioEvent, ScenarioEventKeyed } from "../src/scenario-event";
import { delay, testScenarios } from "./testutils";



test("a requested event with a key is blocked by a block for the same event that has no key", () => {

    let progressedRequestThread = false;

    const eventA = new ScenarioEventKeyed('A');

    const requestingThread = new Scenario(null, function* () {
        yield bp.request(eventA.key(1));
        progressedRequestThread = true;
    })

    const blockingThread = new Scenario(null, function* () {
        yield bp.block(eventA);
    })

    testScenarios((enable, enableEvents) => {
        enableEvents([eventA.key(1)])
        enable(requestingThread);
        enable(blockingThread);
    });
    expect(progressedRequestThread).toBe(false);
});


test("a requested event with a key is blocked by a block with the same event-name and -key", () => {
    let progressedRequestThread1 = false;
    let progressedRequestThread2 = false;

    const eventA = new ScenarioEventKeyed<number>('A');

    const requestingThread = new Scenario(null, function* () {
        yield bp.request(eventA.key(1), 100);
        yield bp.request(eventA.key(2), 200);
        progressedRequestThread1 = true;
        yield bp.request(eventA.key(3), 300);
        progressedRequestThread2 = true;
    })

    const blockingThread = new Scenario(null, function* () {
        yield bp.block(eventA.key(3));
    })

    testScenarios((enable, enableEvents) => {
        enableEvents(eventA.keys(1, 2, 3))
        enable(requestingThread);
        enable(blockingThread);
    });
    expect(progressedRequestThread1).toBe(true);
    expect(progressedRequestThread2).toBe(false);
    expect(eventA.key(1).value).toBe(100);
    expect(eventA.key(2).value).toBe(200);
});

test("a requested event with a disabled key will not progress", () => {

    let progressedRequestThread = false;

    const eventA = new ScenarioEventKeyed('A');

    const requestingThread = new Scenario(null, function* () {
        yield bp.request(eventA.key(1));
        progressedRequestThread = true;
    })

    testScenarios((enable, enableEvents) => {
        enableEvents([eventA.key(2)])
        enable(requestingThread);
    });
    expect(progressedRequestThread).toBe(false);
});


test("an keyed event can be disabled in the staging-function", () => {

    let progressedRequestThread = false;

    const eventA = new ScenarioEventKeyed('A');

    const requestingThread = new Scenario(null, function* () {
        yield bp.request(eventA.key(1));
        progressedRequestThread = true;
    })

    testScenarios((enable, enableEvents) => {
        enableEvents([eventA.key(1)])
        eventA.key(1).disable();
        enable(requestingThread);
    });
    expect(progressedRequestThread).toBe(false);
});


test("a keyed waitFor will not advance on the same Event-Name without a Key", () => {
    let requestProgressed = false, waitProgressed = false;

    const eventAUnkeyed = new ScenarioEvent('A');
    const eventA = new ScenarioEventKeyed('A');

    const requestingThread = new Scenario({id: 'thread1'}, function*() {
        yield bp.request(eventAUnkeyed);
        requestProgressed = true;
    });

    const waitingThread = new Scenario(null, function*() {
        yield [bp.waitFor(eventA.key(1)), bp.waitFor(eventA.key(2))];
        waitProgressed = true;
    });

    testScenarios((enable, enableEvents) => {
        enableEvents([eventAUnkeyed, ...eventA.keys(1,2)])
        enable(requestingThread);
        enable(waitingThread);
    }, () => {
        expect(requestProgressed).toBe(true);
        expect(waitProgressed).toBe(false);
    });
});


test("a wait without a key will react to keyed events with the same name", () => {
    let requestProgressed: any, waitProgressed: any;

    const eventA = new ScenarioEventKeyed('A');
    const eventAUK = new ScenarioEvent('A');

    const requestingThread = new Scenario({id: 'thread1'}, function*() {
        yield bp.request(eventA.key(1));
        requestProgressed = true;
    });

    const waitingThread = new Scenario(null, function*() {
        yield bp.waitFor(eventAUK);
        waitProgressed = true;
    });

    testScenarios((enable, events) => {
        events([eventA.key(1), eventAUK])
        enable(requestingThread);
        enable(waitingThread);
    }, () => {
        expect(requestProgressed).toBe(true);
        expect(waitProgressed).toBe(true);
    });
});
