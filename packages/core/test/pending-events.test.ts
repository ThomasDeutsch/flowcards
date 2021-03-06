import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { scenario } from '../src/scenario';
import { ActionType } from '../src/action';



function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

test("a pending event can not be requested by another thread", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        while (true) {
            yield bp.request("A", () => delay(1000));
        }
    });

    const thread2 = scenario({id: 'thread2'}, function* () {
        yield bp.request("A", "hey");
    });

    testScenarios((enable) => {
        enable(thread2());
        enable(thread1());
    }, ({event, scenario}) => {
        expect(event('A').isPending).toBeTruthy();
        expect(scenario('thread2')?.isCompleted).toBeFalsy();
        done();
    });
});


test("a pending event can not be extended", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        while (true) {
            yield bp.request("A", () => delay(1000));
        }
    });

    const thread2 = scenario({id: 'thread2'}, function* () {
        yield bp.extend("A");
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event}) => {
        expect(event('A').isPending).toBeTruthy();
        done();
    });
});


test("a pending event resolves can not be blocked", done => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.request("A", () => delay(500));
        yield bp.askFor("fin");
    });

    const thread2 = scenario(null, function* () {
        yield bp.request("B", () => delay(200));
        yield bp.block("A");
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event}) => {
        if(event('fin').dispatch) {
            expect(1).toBe(1);
            done();
        }
    });
});



test("pending events can not be dispatched", done => {
    const thread1 = scenario(null, function* () {
        yield bp.request("A", () => delay(500));
    });

    const thread2 = scenario(null, function* () {
        yield bp.askFor("A");
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event}) => {
            if(event('A')) {
                expect(event("A").dispatch).toBeUndefined();
                done();
            }
    });
});

test("After a pending event is resolved, a BThread that has requested this event is progressed", done => {
    const threadOne = scenario(null, function* () {
        yield bp.request("singleAsyncRequest", () => delay(100));
        expect(1).toBe(1);
        done();
    });

    testScenarios((enable) => {
        enable(threadOne());
    });
});


test("If one pending-event is resolved, other promises for this event are cancelled", done => {
    const threadOne = scenario(null, function* (): any {
        const bid = yield [bp.request("A", () => delay(300)), bp.request("B", () => delay(1))];
        expect(bid.eventId.name).toBe("B");
        done();
    });

    const thread2 = scenario({id: 't2'}, function* (): any  {
        const bid = yield [bp.askFor('A'), bp.request("C", () => delay(400))];
        expect(bid.eventId.name).toBe("C");

    })

    testScenarios((enable) => {
        enable(threadOne());
        enable(thread2());
    }, ({log, scenario}) => {
        if(scenario('t2')?.isCompleted) {
            expect(log.actions.filter(a => a.type === 'requestedAction').length).toBe(3);
            expect(log.actions.filter(a => a.type === 'resolveAction').length).toBe(2); // 3 requested, but only 2 resolved because 1 got cancelled
            done();
        }
    });
});



function rejectedPromise(ms: number, errorMsg: string) {
    return new Promise((_, reject) => setTimeout(() => reject(errorMsg), ms));
}

test("rejected pending events will not progress waiting BThreads", done => {
    let thread1Progressed = false;
    let wasCatched = false;
    const thread1 = scenario({id: 'waitingThread'}, function* () {
        yield bp.askFor("A");
        thread1Progressed = true;
    });

    const thread2 = scenario({id: 'requestingThread'}, function* () {
        try{
            yield bp.request("A", () => rejectedPromise(1, 'error message'));
        } catch(e) {
            wasCatched = true;
            expect(e.event.name).toBe('A');
            expect(e.error).toBe('error message');
        }
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({scenario}) => {
        if(scenario({name: 'requestingThread'})?.isCompleted) {
            expect(wasCatched).toBe(true);
            expect(thread1Progressed).toBe(false);
            done();
        }
    });
});

test("if a pending event is rejected, the lower-prio thread will use its request instead", done => {
    const thread1 = scenario(null, function* () {
        const bid = yield bp.request("A", 1);
        expect(bid.payload).toBe(1);
        done();
    });

    const thread2 = scenario(null, function* () {
        try{
            yield bp.request("A", () => rejectedPromise(1, 'error details'));
        } catch(e) {
            //no op
        }
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    });
});

test("if a threads waits for an already existing pending-event, it will also progress when the event is resolved", done => {
    const thread1 = scenario(null, function* () {
        yield bp.request("A", () => delay(500));
    });

    const thread2 = scenario(null, function* () {
        yield bp.request("Y", () => delay(100));
        yield bp.askFor("A");
        yield bp.askFor('fin');
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event}) => {
        if(event("fin").dispatch) {
            expect(1).toBeTruthy();
            done();
        }
    });
});

test("if a thread extends an already existing pending-event, it will trigger that extend when the event resolve", done => {
    let thread1Progressed = false;
    const thread1 = scenario(null, function* () {
        yield bp.request("A", () => delay(500, 'requestedValue'));
        thread1Progressed = true;
    });

    const thread2 = scenario(null, function* () {
        yield bp.request("Y", () => delay(100));
        const extend = yield bp.extend("A");
        expect(extend.payload).toBe('requestedValue');

        expect(thread1Progressed).toBe(false);
        done();
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    });
});

test("after a scenario has a rejected promise, it will place its next bid", done => {
    const thread1 = scenario(null, function* () {
        const bid = yield bp.waitFor("A");
        expect(bid.payload).toBe(1);
        done();
    });


    const thread2 = scenario({id: 's2'}, function* () {
        try{
            yield bp.request("A", () => rejectedPromise(1, 'error details'));
        } catch(e) {
            const bid = yield bp.set("X", 100);
            expect(bid.payload).toBe(100);
        }
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event, scenario}) => {
        if(scenario('s2')?.isCompleted) {
            expect(event('X').value).toBe(100);
            done();
        }
    });
});
