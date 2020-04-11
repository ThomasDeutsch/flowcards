/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from "../src/index";
import { ActionType } from '../src/action';




function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


test("A promise can be requested", () => {
    function* thread1() {
        yield bp.request("A", delay(100));
    }
    scenarios((enable) => {
        enable(thread1);
    }, ({log}) => {
        log.actionsAndReactions
        expect(log.latestAction.eventName).toBe("A");
        expect(log.latestAction.threadId).toBe("thread1");
        expect(log.latestAction.type).toBe(ActionType.requested);
    });
});


test("A promise-function can be requested", () => {
    function* thread1() {
        yield bp.request("A", () => delay(100));
    }
    scenarios((enable) => {
        enable(thread1);
    }, (({log}) => {
        expect(log.latestAction.eventName).toBe("A");
        expect(log.latestAction.threadId).toBe("thread1");
        expect(log.latestAction.type).toBe(ActionType.requested);
    }));
});


test("multiple promises can be requested and pending", () => {
    let threadState: any = null;
    
    function* thread1() {
        yield [bp.request("A", () => delay(1000)), bp.request("B", () => delay(1000))];
    }

    scenarios((enable) => {
        threadState = enable(thread1);
    }, null);

    if(threadState) {
        expect(threadState.pendingEvents).toContain("A");
        expect(threadState.pendingEvents).toContain("B");
    }
});


test("while a thread is pending a request, it will not request it again", () => {
    let count = 0;
    function* thread1() {
        while (true) {
            yield bp.request("A", () => delay(1000));
        }
    }
    scenarios((enable) => {
        enable(thread1);
        count++;
    }, null);
     expect(count).toBe(2); // initial + request
});


test("a pending request can be cancelled", () => {
    let isCancelled;
    
    function* thread1() {
        const [eventName] = yield [bp.request("A", () => delay(1000)), bp.wait("B")];
        isCancelled = eventName === "B" ? true : false;
    }
    function* thread2() {
        yield bp.request("B");
        isCancelled = true;
    }
    scenarios((enable) => {
        const { pendingEvents } = enable(thread1);
        if (pendingEvents && pendingEvents.size > 0) {
            enable(thread2);
        }
    }, null);
    expect(isCancelled).toBe(true);
});


test("a request with a promise will wait for its pending event to resolve", () => {
    let isAdvanced = false;

    function* thread1() {
        yield bp.request("A", () => delay(1));
        isAdvanced = true;
    }
    scenarios((enable) => {
        enable(thread1);
    }, null);
    
    expect(isAdvanced).toBe(false);
});


test("After an async promise is resolved, it will continue its execution", done => {
    function* threadOne() {
        yield bp.request("B", () => delay(100));
        expect(1).toBe(1);
        done();
    }

    scenarios((enable) => {
        enable(threadOne);
    }, null);
});


test("If one promise is resolved, other promises for this yield are cancelled", done => {
    function* threadOne() {
        const [event] = yield [bp.request("A", () => delay(300)), bp.request("B", () => delay(1))];
        expect(event).toBe("B");
        done();
    }

    function* thread2()  {
        const [event] = yield [bp.wait('A'), bp.request("C", () => delay(400))];
        expect(event).toBe("C");
        done();
    }

    scenarios((enable) => {
        enable(threadOne);
        enable(thread2);
    }, null);
});

test("if a promise is resolved, the thread will progress", done => {
    function* threadOne() {
        yield bp.request("B", () => delay(100));
        expect(1).toBe(1);
        done();
    }

    scenarios((enable) => {
        enable(threadOne);
    }, null);
});


function delayedTwo(ms: number) {
    return new Promise(resolve => setTimeout(() => resolve(2), ms));
}

function rejectedPromise(ms: number) {
    return new Promise((_, reject) => setTimeout(() => reject(2), ms));
}

test("if a request from a higher thread is rejected, the lower thread will use its request instead", done => {
    function* thread1() {
        const val = yield bp.request("A", 1);
        expect(val).toEqual(1);
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
    }, null);
});


test("a pending event can not be requested", (done) => {
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
    }, ({log}) => {
        if(log.currentWaits['FIN']) {
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