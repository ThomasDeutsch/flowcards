import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { scenario } from '../src/scenario'
import { delay } from './testutils';
import { BThreadContext } from "../src/bthread";


test("A promise can be requested and will create a pending-event", (done) => {
    const thread1 = scenario({id: 'requestingThread'}, function* () {
        yield bp.request("A", delay(100));
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        if(event('A').isPending) {
            expect(event('A').isPending).toBeTruthy();
            expect(event('A').value).toBeUndefined();
            expect(event('A').history.length).toBe(0);
            expect(event('A').isPending).toEqual(true);
            done();
        }
    });
});


test("a pending event is different from another pending-event if the name OR key are not the same", (done) => {
    const eventAOne = {name: "A", key: 1};
    const thread1 = scenario({id: 'requestingThreadOne'}, function* () {
        yield bp.onPending({name: 'A' });
        yield bp.request("A", delay(100));
    });
    const thread2 = scenario({id: 'requestingThreadTwo'}, function* () {
        yield bp.request(eventAOne, delay(50));
    });

    testScenarios((enable) => {
        enable(thread2());
        enable(thread1());
    }, ({event, scenario}) => {
        if(event({name: 'A', key: 1}).isPending) {
            expect(event('A').isPending).toBeDefined();
        } else if(event('A').isPending) {
            expect(scenario('requestingThreadTwo')?.isCompleted).toBeTruthy();
            done();
        }
    });
});

test("pending-events with the same name but different keys can be run in parallel", (done) => {
    const thread1 = scenario({id: 'requestingThreadOne'}, function* () {
        yield bp.request({name: "A", key: 1}, () => delay(25000));
    });
    const thread2 = scenario({id: 'requestingThreadTwo'}, function* () {
        yield bp.request({name: "A", key: 2}, () => delay(25000));
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event, scenario}) => {
        if(event({name: 'A', key: 1}).isPending && event({name: 'A', key: 2}).isPending) {
            expect(scenario('requestingThreadOne')?.isCompleted).toBeFalsy();
            expect(scenario('requestingThreadTwo')?.isCompleted).toBeFalsy();
            done();
        }
    });
});


test("A promise-function can be requested and will create a pending-event", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.request("A", () => delay(100));
    });

    testScenarios((enable) => {
        enable(thread1());
    }, (({event}) => {
        const isAPending = event('A').isPending;
        if(isAPending) {
            expect(isAPending).toBeTruthy();
            expect(event('A').dispatch).toBeUndefined();
            done();
        }
    }));
});


test("multiple async-requests can be run sequentially", (done) => {
    let threadResetCounter = -1;
    const flow1 = scenario({id: "flow1", description: "card validation scenario"},
        function*() {
            threadResetCounter++;
            yield bp.request("WaitForCard", () => delay(100));
            yield bp.request("ValidateCard", () => delay(100));
            yield bp.request("LoadAccount", () => delay(100));
            yield bp.request("WaitForPin", () => delay(100));
        }
    );

    testScenarios((enable) => {
        enable(flow1());
    }, (({scenario}) => {
        if(scenario('flow1')?.isCompleted) {
            expect(threadResetCounter).toEqual(0);
            done();
        }
    }));
});


test("for multiple active promises in one yield, only one resolve will progress the BThread", (done) => {
    let progressed2 = false;
    let progressed3 = false;

    const thread1 = scenario({id: 'requestingThread'}, function* () {
        yield [bp.request("HEYYA", () => delay(1000)), bp.request("HEYYB", () => delay(1000))];
    });

    const thread2 = scenario(null, function* () {
        yield bp.askFor('HEYYA');
        progressed2 = true;
    });

    const thread3 = scenario(null, function* () {
        yield bp.askFor('HEYYB');
        progressed3 = true;
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
        enable(thread3());
    }, ({scenario}) => {
        if(scenario('requestingThread')?.isCompleted) {
            expect(progressed2).not.toBe(progressed3);
            done();
        }
    });
});


test("if a thread gets disabled, before the pending-event resolves, the pending-event resolve will still be dispatched", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.request("A", () => delay(100));
        const bid = yield [bp.askFor('B'),  bp.request("X", () => delay(500))];
        expect(bid.eventId.name).toEqual('B');
    });

    const thread2 = scenario({id: 'thread2'}, function*() {
        yield bp.request("B", () => delay(300));
    });

    testScenarios((enable) => {
        const t1 = enable(thread1());
        if(t1.pendingBids.has('A')) {
            enable(thread2());
        }
    }, (({scenario}) => {
        if(scenario('thread1')?.isCompleted) {
            expect(scenario('thread2')?.isCompleted).toBeTruthy();
            done();
        }
    }));
});

test("given the destoryOnDisable option, pending events will be canceled on destroy", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.request("A", () => delay(100));
        const bid = yield [bp.askFor('B'),  bp.request("X", () => delay(500))];
        expect(bid.eventId.name).toEqual('X');
    });

    const thread2 = scenario({id: 'thread2', destroyOnDisable: true}, function*() {
        yield bp.request("B", () => delay(300));
    });

    testScenarios((enable) => {
        const t1 = enable(thread1());
        if(t1.pendingBids.has('A')) {
            enable(thread2());
        }
    }, (({scenario}) => {
        if(scenario('thread1')?.isCompleted) {
            expect(scenario('thread2')?.isCompleted).toBeFalsy();
            done();
        }
    }));
});


test("a thread in a pending-event state can place additional bids.", (done) => {
    const thread1 = scenario({id: 'requestingThread'}, function* (this: BThreadContext) {
        yield [bp.request("A", () => delay(100)), bp.block('B')];
    });

    const thread2 = scenario({id: 'waitingThread'}, function* () {
        yield bp.askFor('B');
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event, scenario}) => {
        if(event('A').isPending) {
            expect(event('B').validate(1).isValid).toBe(false);
        } else if( scenario('requestingThread')?.isCompleted) {
            expect(event('B').validate().isValid).toBe(true);
            done();
        }
    });
});




// TODO: a resolve/reject can not be blocked
