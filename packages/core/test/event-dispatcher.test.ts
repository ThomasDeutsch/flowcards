import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { BThreadContext, EventInfo } from '../src/index';
import { scenario } from '../src/scenario';


test("an askFor bid can be dispatched", (done) => {
    const asking = scenario(null, function* () {
        yield bp.askFor('A');
    })

    testScenarios((enable) => {
        enable(asking());
    }, ({event}) => {
        expect(event('A').dispatch).toBeDefined();
        done();
    });
});

test("only the exact asked for bid can be dispatched", (done) => {
    // this is the same as with requests. A request with a key will trigger the askFor without a key.
    const asking = scenario(null, function* () {
        yield bp.askFor('A');
    })

    testScenarios((enable) => {
        enable(asking());
    }, ({event}) => {
        expect(event({name: 'A', key: 1}).dispatch).toBeUndefined();
        done();
    });
});

test("an askFor bid can be dispatched with the corresponding key", (done) => {
    const asking = scenario(null, function* () {
        yield bp.askFor({name: 'AX', key: 1});
    })

    testScenarios((enable) => {
        enable(asking());
    }, ({event}) => {
        expect(event({name: 'AX', key: 1}).dispatch).toBeDefined();
        done();
    });
});


test("askFor-bids can be dispatched", () => {
    const thread1 = scenario(null, function* () {
        yield bp.askFor('A');
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        expect(event('A').dispatch).toBeDefined();
    });
});

test("askFor-bids with a key can not be dispatched by the same event-name but without a key.", () => {
    const thread1 = scenario(null, function* () {
        yield bp.askFor({name: 'A', key: 1});
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        expect(event('A').dispatch).toBeUndefined();
        expect(event({name: 'A', key: 1}).dispatch).toBeDefined();
        expect(event({name: 'A', key: 2}).dispatch).toBeUndefined();
    });
});

test("waitFor-bids can not be dispatched", () => {
    const thread1 = scenario(null, function* () {
        yield bp.waitFor('A');
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        expect(event('A').dispatch).toBeUndefined();
    });
});

    //TODO: Teste den fall, dass 2x eine UI-Action gefeuert wurde, diese aber nur 1x ausgeführt wurden durfte -> eine warnung wird ausgegeben.
    //TODO: Teste den fall, dass eine request-action, eine ui-action gleichzeitig in der update-loop vorhanden sind.
test("multiple dispatches are batched", (done) => {
    const thread1 = scenario(null, function* (this: BThreadContext) {
        yield [bp.request("asyncRequest1", () => delay(100)), bp.askFor("X"), bp.askFor("B")];
        yield [bp.request("asyncRequest2", () => delay(100)), bp.askFor("X"), bp.askFor("Z")];
    });

    const {event} = testScenarios((enable) => {
        enable(thread1());
    });
    expect(event('X').dispatch).toBeDefined();
    event('X').dispatch?.();
    expect(event('X').dispatch).toBeDefined();
    event('X').dispatch?.();
    done();
});


test("a keyed askFor is blocked by a no-key block, and can not be dispatched", () => {
    let progressedRequestThread = false;

    const waitingThread = scenario(null, function* () {
        yield bp.askFor({name: 'AX', key: 1});
        progressedRequestThread = true;
    })

    const blockingThread = scenario(null, function* () {
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


test("a dispatch is defined, if a keyed event is not blocked", (done) => {
    let progressedRequestThread = false;

    const waitingThread = scenario(null, function* () {
        yield [bp.askFor({name: 'AX', key: 1}), bp.askFor({name: 'AX', key: 2})];
        progressedRequestThread = true;
    })

    const blockingThread = scenario(null, function* () {
        yield bp.block({name: 'AX', key: 1});
    })

    testScenarios((enable) => {
        enable(waitingThread());
        enable(blockingThread());
    }, ({event}) => {
        expect(event({name: 'AX', key: 1}).dispatch).toBeUndefined();
        expect(event({name: 'AX', key: 2}).dispatch).toBeDefined();
        done();
    });
    expect(progressedRequestThread).toBe(false);
});


test("a pending event can not be dispatched", (done) => {
    const waitingThread = scenario(null, function* () {
        yield bp.askFor({name: 'A'});
    })

    const requestingThread = scenario(null, function* () {
        yield bp.request({name: 'A'}, () => delay(1000));
        done();
    })

    testScenarios((enable) => {
        enable(waitingThread());
        enable(requestingThread());
    }, ({event}) => {
        if(event({name: 'A'}).isPending) {
            expect(event({name: 'A'}).dispatch).toBeUndefined();
        }
    });
});


test("there is be a dispatch-function for every askingFor event", () => {
    const thread1 = scenario(null, function* () {
        yield [bp.askFor("eventOne"), bp.askFor("eventTwo")];
    })

    const thread2 = scenario(null, function* () {
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


test("dispatches will be bundled, but invalid dispatches will be ignored", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.askFor("eventOne");
        yield bp.askFor("eventTwo");
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        if(event("eventOne").dispatch) {
            event("eventOne").dispatch?.();
            event("eventOne").dispatch?.(); // this event is ignored.
        } else {
            expect(event('eventTwo').dispatch).toBeDefined();
            done();
        }
    });
});

test("event-info can be typed", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.set("eventOne", 1);
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event, scenario}) => {
        if(scenario("thread1")?.isCompleted) {
            const value = event<number>("eventOne")?.value;
            expect(typeof value).toBe('number');
            done();
        }
    });
});
