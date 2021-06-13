import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { scenario } from '../src/scenario';


// REQUESTS & WAITS
//-------------------------------------------------------------------------
test("a requested event that is not blocked will advance", () => {
    const requestingThread = scenario({id: 'thread1', }, function*() {
        yield bp.request("A");
    });

    testScenarios((enable) => {
        enable(requestingThread());
    }, ({scenario})=> {
        const state = scenario({name: 'thread1'});
        expect(state).toBeDefined();
        expect(state?.isCompleted).toBe(true);
        expect(state?.progressionCount).toBe(1);
    });
});




test("a request will also advance waiting threads", () => {
    const requestingThread = scenario({id: 'thread1'}, function*() {
        yield bp.request("A");
    });

    const askingThread = scenario(null, function*() {
        yield bp.askFor("A");
    });

    const waitingThread = scenario(null, function*() {
        yield bp.waitFor("A");
    });

    testScenarios((enable) => {
        enable(requestingThread());
        enable(askingThread());
        enable(waitingThread());
    }, ({scenario}) => {
        const thread1 = scenario({name: 'thread1'});
        expect(thread1).toBeDefined();
    });
});


test("waits will return the value that has been requested", () => {
    const requestThread = scenario({id: 'requestThread'}, function* () {
        yield bp.request("A", 1000);
    });

    const receiveThread = scenario({id: 'receiveThread'}, function* () {
        const bid = yield bp.askFor("A");
        expect(bid.payload).toBe(1000);
    });

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThread());
    });
});


test("multiple requests will return an array of [eventId, value].", () => {

    const requestThread = scenario(null, function* () {
        const bid = yield [bp.request("A", 1000), bp.request("B", 2000)];
        expect(bid.eventId.name).toBe('B');
    });

    const receiveThreadB = scenario(null, function* () {
        const bid = yield bp.askFor("B");
        expect(bid.eventId.name).toBe('B');
    });

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThreadB());
    });
});


test("multiple bids can be expressed as an array.", () => {

    const requestThread = scenario(null, function* () {
        yield bp.request("A", 1000);
    })

    const receiveThread = scenario(null, function* () {
        const bid = yield [bp.askFor("A"), bp.askFor("B")];
        expect(bid.payload).toBe(1000);
        expect(bid.eventId.name).toBe("A");
    })

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThread());
    });
});


test("A request-value can be a function. It will get called, when the event is selected", () => {

    const requestThread = scenario(null, function* () {
        yield bp.request("A", () => 1000);
    })

    const receiveThread = scenario(null, function* () {
        const bid = yield [bp.askFor("A"), bp.askFor("B")];
        expect(bid.payload).toBe(1000);
        expect(bid.eventId.name).toBe("A");
    })

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThread());
    });
});


test("if a request value is a function, it will only be called once.", () => {
    let receivedValue1 = 1000,
        receivedValue2 = 1000,
        fnCount = 0;

    const requestThread = scenario(null, function* () {
        yield bp.request("A", () => {
            fnCount++;
            return 1000;
        });
    });

    const receiveThread1 = scenario(null, function* () {
        const bid1 = yield bp.askFor("A");
        receivedValue1 = bid1.payload;
    });

    const receiveThread2 = scenario(null, function* () {
        const bid = yield bp.askFor("A");
        receivedValue2 = bid.payload;
    })

    testScenarios((enable) => {
        enable(requestThread());
        enable(receiveThread1());
        enable(receiveThread2());
    }, () => {
        expect(receivedValue1).toBe(1000);
        expect(receivedValue2).toBe(1000);
        expect(fnCount).toBe(1);
    });
});

test("When there are multiple requests with the same event-name, the request with the higher priority will get selected first", () => {
    let receivedValue: number;

    const requestThreadLower = scenario(null, function* () {
        yield bp.request("A", 1);
    });

    const requestThreadHigher = scenario(null, function* () {
        yield bp.request("A", 2);
    });

    const receiveThread = scenario(null, function* () {
        const bid = yield bp.waitFor("A");
        receivedValue = bid.payload
    })

    testScenarios((enable) => {
        enable(requestThreadLower());
        enable(requestThreadHigher()); // this thread has a higher priority, because it gets enabled later than the first one.
        enable(receiveThread());
    }, () => {
        expect(receivedValue).toBe(2);
    });
});


// BLOCK
//-------------------------------------------------------------------------

test("events can be blocked", () => {
    let advancedRequest: boolean, advancedWait: boolean;

    const requestThread = scenario(null, function* () {
        yield bp.request("AX");
        advancedRequest = true;
    });

    const waitingThread = scenario(null, function* () {
        yield bp.askFor("AX");
        advancedWait = true;
    });

    const blockingThread = scenario(null, function* () {
        yield bp.block("AX");
    });

    testScenarios((enable) => {

        enable(requestThread());
        enable(waitingThread());
        enable(blockingThread());
    }, () => {
        expect(advancedRequest).toBeUndefined();
        expect(advancedWait).toBeUndefined();
    });
});


test("if an async request gets blocked, it will not call the bid-function", () => {
    let calledFunction = false;

    const requestingThread = scenario(null, function* () {
        yield bp.request("AX", () => { calledFunction = true; });
    })

    const blockingThread = scenario(null, function* () {
        yield bp.block("AX");
    })

    testScenarios((enable) => {
        enable(requestingThread());
        enable(blockingThread());
    });
    expect(calledFunction).toBe(false);
});


test("a requested event with a key is blocked by a block for the same event that has no key", () => {
    let progressedRequestThread = false;

    const requestingThread = scenario(null, function* () {
        yield bp.request({name: 'AX', key: 1});
        progressedRequestThread = true;
    })

    const blockingThread = scenario(null, function* () {
        yield bp.block("AX");
    })

    testScenarios((enable) => {
        enable(requestingThread());
        enable(blockingThread());
    });
    expect(progressedRequestThread).toBe(false);
});


test("a requested event with a key is blocked by a block with the same event-name and -key", () => {
    let progressedRequestThread1 = false;
    let progressedRequestThread2 = false;

    const requestingThread = scenario(null, function* () {
        yield bp.request({name: 'AX', key: 1});
        progressedRequestThread1 = true;
        yield bp.request({name: 'AX', key: 2});
        progressedRequestThread2 = true;
    })

    const blockingThread = scenario(null, function* () {
        yield bp.block({name: 'AX', key: 2});
    })

    testScenarios((enable) => {
        enable(requestingThread());
        enable(blockingThread());
    });
    expect(progressedRequestThread1).toBe(true);
    expect(progressedRequestThread2).toBe(false);
});


test("a keyed wait will not progress on an event that is more general", () => {
    let requestProgressed = false, waitProgressed = false;

    const requestingThread = scenario({id: 'thread1'}, function*() {
        yield bp.request("A");
        requestProgressed = true;
    });

    const waitingThread = scenario(null, function*() {
        yield [bp.askFor({name: 'A', key: 1}), bp.askFor({name: 'A', key: 2})];
        waitProgressed = true;
    });

    testScenarios((enable) => {
        enable(requestingThread());
        enable(waitingThread());
    }, () => {
        expect(requestProgressed).toBe(true);
        expect(waitProgressed).toBe(false);
    });
});


test("a wait without a key will react to keyed events with the same name", () => {
    let requestProgressed: any, waitProgressed: any;

    const requestingThread = scenario({id: 'thread1'}, function*() {
        yield bp.request({name: 'A', key: 1});
        requestProgressed = true;
    });

    const waitingThread = scenario(null, function*() {
        yield bp.waitFor('A');
        waitProgressed = true;
    });

    testScenarios((enable) => {
        enable(requestingThread());
        enable(waitingThread());
    }, () => {
        expect(requestProgressed).toBe(true);
        expect(waitProgressed).toBe(true);
    });
});

test("if a thread has multiple requests, the last request has the highest priority.", () => {
    let requestProgressed = false;

    const requestingThread = scenario({id: 'thread1'}, function*() {
        const bid = yield [bp.request({name: 'A', key: 1}), bp.request({name: 'A', key: 3}), bp.request({name: 'A', key: 4})];
        expect(bid.eventId.key).toEqual(4);
        requestProgressed = true;
    });

    testScenarios((enable) => {
        enable(requestingThread());
    }, () => {
        expect(requestProgressed).toBe(true);
    });
});


test("with multiple requests for the same eventId, highest priority request is selected - that is also valid", () => {
    let lowerPrioRequestProgressed = false;
    let higherPrioRequestProgressed = false;

    const requestingThread1 = scenario({id: 'thread1'}, function*() {
        yield bp.request('eventA', 1);
        lowerPrioRequestProgressed = true;
    });

    const requestingThread2 = scenario({id: 'thread2'}, function*() {
        yield bp.request('eventA', 10);
        higherPrioRequestProgressed = true;
    });

    const validatingThread = scenario({id: 'thread3'}, function*() {
        yield bp.validate('eventA', (payload) => payload !== 10);
    });

    testScenarios((enable) => {
        enable(requestingThread1());
        enable(requestingThread2());
        enable(validatingThread());
    }, () => {
        expect(lowerPrioRequestProgressed).toBe(true);
        expect(higherPrioRequestProgressed).toBe(false);

    });
});



test("with multiple askFor for the same eventId, highest priority request is selected - that is also valid", () => {
    let lowerPrioProgressed = false;
    let higherPrioProgressed = false;

    const askingThreadLow = scenario({id: 'thread1'}, function*() {
        yield bp.askFor('eventA', (pl) => pl > 10);
        lowerPrioProgressed = true;
    });

    const askingThreadHigh = scenario({id: 'thread2'}, function*() {
        yield bp.askFor('eventA', (pl) => pl < 10);
        higherPrioProgressed = true;
    });

    const requestingThread = scenario({id: 'thread3'}, function*() {
        yield bp.request('eventA', 11);
    });

    testScenarios((enable) => {
        enable(askingThreadLow());
        enable(askingThreadHigh());
        enable(requestingThread());
    }, () => {
        expect(lowerPrioProgressed).toBe(true);
        expect(higherPrioProgressed).toBe(false);

    });
});
