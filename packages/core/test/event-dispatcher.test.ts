import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { BThreadContext } from '../src/index';
import { flow } from '../src/scenario';

test("on-bids can not be dispatched", () => {
    const thread1 = flow(null, function* () {
        yield bp.on('A');
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        expect(event('A').dispatch).toBeUndefined();
    });
});


test("multiple dispatches are batched", (done) => {
    const thread1 = flow(null, function* (this: BThreadContext) {
        yield [bp.request("asyncRequest", () => delay(100)), bp.askFor("X"), bp.askFor("A")];
        yield [bp.request("asyncRequest", () => delay(100)), bp.askFor("Y"), bp.askFor("A")];
    });

    const [{event}] = testScenarios((enable) => {
        enable(thread1());
    });
    expect(event('X').dispatch).toBeDefined();
    event('X').dispatch?.();
    expect(event('X').dispatch).toBeDefined();
    event('X')?.dispatch?.();
    done();
});


test("a keyed event is blocked by a no-key block, and can not be dispatched", () => {
    let progressedRequestThread = false;

    const waitingThread = flow(null, function* () {
        yield bp.askFor({name: 'AX', key: 1});
        progressedRequestThread = true;
    })

    const blockingThread = flow(null, function* () {
        yield bp.block("AX");
    })

    testScenarios((enable) => {
        enable(waitingThread());
        enable(blockingThread());
    }, ({event}) => {
        expect(event({name: 'AX', key: 1}).dispatch).toBeUndefined();
    });
    expect(progressedRequestThread).toBe(false);
});


test("a dispatch is defined, if a keyed event is not blocked", () => {
    let progressedRequestThread = false;

    const waitingThread = flow(null, function* () {
        yield [bp.askFor({name: 'AX', key: 1}), bp.askFor({name: 'AX', key: 2})];
        progressedRequestThread = true;
    })

    const blockingThread = flow(null, function* () {
        yield bp.block({name: 'AX', key: 1});
    })

    testScenarios((enable) => {
        enable(waitingThread());
        enable(blockingThread());
    }, ({event}) => {
        expect(event({name: 'AX', key: 1}).dispatch).toBeUndefined();
        expect(event({name: 'AX', key: 2}).dispatch).toBeDefined();

    });
    expect(progressedRequestThread).toBe(false);
});

test("a pending event can not be dispatched", () => {
    const waitingThread = flow(null, function* () {
        yield bp.askFor({name: 'A'});
    })

    const requestingThread = flow(null, function* () {
        yield bp.request({name: 'A'}, () => delay(1000));
    })

    testScenarios((enable) => {
        enable(waitingThread());
        enable(requestingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).isPending).toBeTruthy();
        expect(event({name: 'A'}).dispatch).toBeUndefined();
    });
});

test("there is be a dispatch-function for every waiting event", () => {
    const thread1 = flow(null, function* () {
        yield [bp.askFor("eventOne"), bp.askFor("eventTwo")];
    })

    const thread2 = flow(null, function* () {
        yield bp.askFor("eventThree");
    })

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event}) => {
        expect(event('eventOne').dispatch).toBeDefined();
        expect(event('eventTwo').dispatch).toBeDefined();
        expect(event('eventThree').dispatch).toBeDefined();
        expect(event('XXY').dispatch).toBeUndefined();

    });
});