import * as bp from "../src/bid";
import { scenarios } from "./testutils";
import { ActionType } from '../src/action';


function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

test("a pending event can not be requested", () => {
    function* thread1() {
        while (true) {
            yield bp.request("A", () => delay(1000));
        }
    }
    function* thread2() {
        yield bp.request("A", "hey");
    }
    scenarios((enable) => {
        enable(thread2);
        enable(thread1);
    }, ({log}) => {
        expect(log?.currentPendingEvents.has({name: 'A'})).toBeTruthy();
        expect(log?.latestAction.threadId).toBe("thread1");
    });
});


test("a pending event can not be intercepted", () => {
    function* thread1() {
        while (true) {
            yield bp.request("A", () => delay(1000));
        }
    }
    function* thread2() {
        yield bp.intercept("A");
    }
    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, ({log}) => {
        expect(log?.currentPendingEvents.has({name: 'A'})).toBeTruthy();
        expect(log?.latestAction.threadId).toBe("thread1");
        expect(log?.actionsAndReactions.length).toBe(2); // init + request("A"..)
    });
});


test("a pending event resolves can not be blocked", done => {
    function* thread1() {
        yield bp.request("A", () => delay(500));
        yield bp.wait("fin");
    }
    function* thread2() {
        yield bp.request("B", () => delay(200));
        yield bp.block("A");
    }
    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, ({log, dispatch}) => {
        if(dispatch('fin')) {
            expect(log?.latestAction.threadId).toBe("thread1");
            expect(log?.latestAction.type).toBe(ActionType.resolved);
            done();
        }
    });
});



test("pending events can not be dispatched", done => {
    function* thread1() {
        yield bp.request("A", () => delay(500));
    }
    function* thread2() {
        yield bp.wait("A");
    }
    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, ({dispatch}) => {
            expect(dispatch("A")).toBeUndefined();
            done();
    });
});

test("After a pending event is resolved, a BThread that has requested this event is progressed", done => {
    function* threadOne() {
        yield bp.request("B", () => delay(100));
        expect(1).toBe(1);
        done();
    }

    scenarios((enable) => {
        enable(threadOne);
    });
});


test("If one pending-event is resolved, other promises for this event are cancelled", done => {
    function* threadOne(): any {
        const [event] = yield [bp.request("A", () => delay(300)), bp.request("B", () => delay(1))];
        expect(event).toBe("B");
        done();
    }

    function* thread2(): any  {
        const [event] = yield [bp.wait('A'), bp.request("C", () => delay(400))];
        expect(event.name).toBe("C");
        done();
    }

    scenarios((enable) => {
        enable(threadOne);
        enable(thread2);
    });
});



function rejectedPromise(ms: number) {
    return new Promise((_, reject) => setTimeout(() => reject(2), ms));
}

test("rejected pending events will not progress waiting BThreads", done => {
    function* thread1() {
        const val = yield bp.request("A", 1);
        expect(val).toBe(1);
        done();
        
    }
    function* thread2() {
        try{
            yield bp.request("A", () => rejectedPromise(1));
        } catch(e) {
            //no op
        }
    }
    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    });
});

test("if a pending event is rejected, the lower thread will use its request instead", done => {
    function* thread1() {
        const val = yield bp.request("A", 1);
        expect(val).toBe(1);
        done();
        
    }
    function* thread2() {
        try{
            yield bp.request("A", () => rejectedPromise(1));
        } catch(e) {
            //no op
        }
    }
    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    });
});


test("a pending event can not be requested - second example", (done) => {
    let count = 0;

    function* thread1() {
        yield bp.request('X', () => delay(100));
        yield bp.request('A', 1);
        yield bp.wait('FIN');
    }

    function* thread2() {
        yield bp.request('A', () => delay(200));
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
        count++;
    }, ({dispatch}) => {
        if(dispatch('FIN')) {
            expect(count).toEqual(8);
            // 1:   initial
            // 2,3: x & a request, 
            // 4:   no request-bid ( waiting for dispatched action, because 'A' is still pending )
            // 5:   x resolved
            // 6:   a resolved
            // 7:   a requested
            // 8:   no request-bid ( waiting for dispatched action )
            done();
        }
    });
});

test("if a threads waits for an already existing pending-event, it will also progress when the event is resolved", done => {
    function* thread1() {
        yield bp.request("A", () => delay(500));
    }
    function* thread2() {
        yield bp.request("Y", () => delay(100));
        yield bp.wait("A");
        yield bp.request('fin');
    }
    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, ({log}) => {
        if(log?.latestAction.event.name === "fin") {
            expect(1).toBeTruthy();
            done();
        }
    });
});

test("if a threads intercepts an already existing pending-event, it will trigger that intercept when the event resolve", done => {
    let thread1Progressed = false;
    function* thread1() {
        yield bp.request("A", () => delay(500, 'requestedValue'));
        thread1Progressed = true;
        
    }
    function* thread2() {
        yield bp.request("Y", () => delay(100));
        const intercept = yield bp.intercept("A");
        expect(intercept.value).toBe('requestedValue');
        
        expect(thread1Progressed).toBe(false);
        done();
    }
    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    });
});
