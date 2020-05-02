/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from "./testutils";
import { InterceptResult } from "../src/bthread";


function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}


// INTERCEPTS
//-------------------------------------------------------------------------

test("requests can be intercepted", () => {
    let progressedRequest = false,
        progressedIntercept = false,
        setupCount = 0;

    function* thread1() {
        yield bp.request("A");
        progressedRequest = true;
    }

    function* thread3() {
        yield bp.intercept("A");
        progressedIntercept = true;
        yield bp.wait('X');
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread3);
        setupCount++;
    }, ({log}) => {
        expect(setupCount).toEqual(2);
        expect(progressedIntercept).toBe(true);
        expect(progressedRequest).toBe(false);
        expect(log?.currentPendingEvents.has({name: 'A'})).toEqual(true);
    }
 );  
});


test("if the intercept has a payload, all threads will continue with that payload", () => {
    let requestValue = 0,
        interceptValue = 0,
        waitValue = 0,
        setupCount = 0;

    function* thread1() {
        requestValue = yield bp.request("A");
    }

    function* thread2() {
        waitValue = yield bp.wait('A');
    }

    function* thread3() {
        interceptValue = yield bp.intercept("A", null, 1000);
        yield bp.wait('X');
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
        enable(thread3);
        setupCount++;
    }, ({log}) => {
        expect(setupCount).toEqual(2);
        expect(waitValue).toEqual(1000);
        expect(requestValue).toEqual(1000);
        expect(interceptValue).toEqual(1000);
    }
 );  
});


test("the intercept payload can be a function.", () => {
    let requestValue = 0,
        interceptValue = 0,
        waitValue = 0,
        setupCount = 0;

    function* thread1() {
        requestValue = yield bp.request("A", 100);
    }

    function* thread2() {
        waitValue = yield bp.wait('A');
    }

    function* thread3() {
        interceptValue = yield bp.intercept("A", null, (x:number) => x + 1000);
        yield bp.wait('X');
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
        enable(thread3);
        setupCount++;
    }, ({log}) => {
        expect(setupCount).toEqual(2);
        expect(waitValue).toEqual(1100);
        expect(requestValue).toEqual(1100);
        expect(interceptValue).toEqual(1100);
    }
 );  
});


test("if the intercept payload is a promise, a pending-event is created.", done => {
    let requestValue = 0,
        interceptValue = 0,
        waitValue = 0,
        setupCount = 0;

    function* thread1() {
        requestValue = yield bp.request("A", 100);
    }

    function* thread2() {
        waitValue = yield bp.wait('A');
    }

    function* thread3() {
        interceptValue = yield bp.intercept("A", null, (x:number) => delay(100, x + 1000));
        yield bp.wait('Fin')
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
        enable(thread3);
        setupCount++;
    }, ({dispatch}) => {
        if(dispatch('Fin')) {
            expect(waitValue).toEqual(1100);
            expect(requestValue).toEqual(1100);
            expect(interceptValue).toEqual(1100);
            done();
        }
    }
 );  
});

test("if an intercept is not applied, than the next intercept will get the event", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;
    let waitCAdvanced = false;
    let waitDAdvanced = false;

    function* requestThread() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* waitThread() {
        yield bp.wait("A", (pl: number) => pl === 1000);
        waitBAdvanced = true;
    }

    function* interceptPriorityLowThread() {
        yield bp.intercept("A", (pl: number) => pl === 1000);
        waitCAdvanced = true;
    }

    function* interceptPriorityHighThread() {
        yield bp.intercept("A", (pl: number) => pl !== 1000);
        waitDAdvanced = true;
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(waitThread);
        enable(interceptPriorityLowThread);
        enable(interceptPriorityHighThread);
    }, ({log}) => {
        expect(waitBAdvanced).toBe(false);
        expect(waitCAdvanced).toBe(true);
        expect(waitDAdvanced).toBe(false);
        expect(requestAdvanced).toBe(false);
        expect(log?.currentPendingEvents.has({name: "A"})).toBe(true);
        expect(log?.latestAction.event.name).toBe("A");
    });
});

test("if an intercepted thread completed, without resolving or rejecting the event, it will keep the event pending", () => {
    let progressedRequest = false,
        progressedIntercept = false,
        setupCount = 0;

    function* thread1() {
        yield bp.request("A");
        progressedRequest = true;
    }

    function* thread3() {
        yield bp.intercept("A");
        progressedIntercept = true;
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread3);
        setupCount++;
    }, ({log}) => {
        expect(log?.currentPendingEvents.has({name: 'A'})).toEqual(true);
    }
 );
    expect(setupCount).toEqual(2);
    expect(progressedRequest).toBe(false);
    expect(progressedIntercept).toBe(true);
});


test("intercepts will receive a value (like waits)", () => {
    let interceptedValue: InterceptResult;
    let thread1Advanced = false;

    function* thread1() {
        yield bp.request("A", 1000);
        thread1Advanced = true;
    }

    function* thread2() {
        yield bp.wait("A");
    }

    function* thread3() {
        interceptedValue = yield bp.intercept("A");
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
        enable(thread3);
    }, ({log}) => {
        expect(thread1Advanced).toBe(false);
        expect(interceptedValue.value).toBe(1000);
        expect(log?.currentPendingEvents.has({name: 'A'}));
    });
});


test("intercepts will intercept requests", () => {
    let intercepted: InterceptResult

    function* thread1() {
        yield bp.request("A", 1000);
    }

    function* thread2() {
        intercepted = yield bp.intercept("A");
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, () => {
        expect(intercepted.value).toEqual(1000);
    });
});


test("the last intercept that is enabled has the highest priority", () => {
    let advancedThread1, advancedThread2;

    function* requestThread() {
        yield bp.request("A");
    }

    function* interceptThread1() {
        yield bp.intercept("A");
        advancedThread1 = true;
    }
    
    function* interceptThread2() {
        yield bp.intercept("A");
        advancedThread2 = true;
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(interceptThread1);
        enable(interceptThread2);
    });

    expect(advancedThread1).toBeFalsy();
    expect(advancedThread2).toBe(true);
});


test("an intercept will create a pending event", () => {
    function* requestingThread() {
        yield bp.request("A", delay(100));
    }
    function* interceptingThread() {
        yield bp.intercept("A");
    }
    scenarios((enable) => {
        enable(requestingThread);
        enable(interceptingThread);
    }, ({log}) => {
        expect(log?.currentPendingEvents.has({name: 'A'})).toBe(true);
    });
});


test("an intercept will wait for the pending-event to finish before it intercpets.", (done) => {
    function* requestingThread() {
        yield bp.request("A", delay(100, 'resolvedValue'));
    }
    function* interceptingThread() {
        const {value} = yield bp.intercept("A");
        expect(value).toBe('resolvedValue');
        done();
    }
    scenarios((enable) => {
        enable(requestingThread);
        enable(interceptingThread);
    }, ({log}) => {
        expect(log?.currentPendingEvents.has({name: 'A'})).toBe(true);
    });
});


test("an intercept can be resolved. This will progress waits and requests", (done) => {
    function* requestingThread() {
        const val = yield bp.request("A", delay(100, 'super'));
        expect(val).toBe('super duper');
    }
    function* interceptingThread() {
        const intercept = yield bp.intercept("A");
        expect(intercept.value).toBe('super');
        intercept.resolve('super duper');
    }
    function* waitingThread() {
        const val = yield bp.wait("A");
        expect(val).toBe('super duper');
        yield bp.wait('fin');
    }
    scenarios((enable) => {
        enable(requestingThread);
        enable(interceptingThread);
        enable(waitingThread);
    }, ({dispatch}) => {
        if(dispatch('fin')) {
            done();
        }  
    });
});


test("an intercept can be rejected. This will remove the pending event", (done) => {
    function* requestingThread() {
        const val = yield bp.request("A", delay(100, 'super'));
        expect(val).toBe('super');
    }
    function* interceptingThread() {
        const intercept = yield bp.intercept("A");
        expect(intercept.value).toBe('super');
        intercept.reject();
    }
    function* waitingThread() {
        const val = yield bp.wait("A");
        expect(val).toBe('super');
        yield bp.wait('fin');
    }
    scenarios((enable) => {
        enable(requestingThread);
        enable(interceptingThread);
        enable(waitingThread);
    }, ({dispatch}) => {
        if(dispatch('fin')) {
            done();
        }  
    });
});

test("an intercept will keep the event-pending if the BThread with the intercept completes.", () => {
    let requestingThreadProgressed = false;
    function* requestingThread() {
        yield bp.request("A", 1);
        requestingThreadProgressed = true;
    }
    function* interceptingThread() {
        yield bp.intercept("A");
        // after the intercept, this BThread completes, keepting the intercept active.
    }
    scenarios((enable) => {
        enable(requestingThread);
        enable(interceptingThread);
    }, ({log}) => {
        expect(log?.currentPendingEvents.has({name: 'A'})).toBe(true);
        expect(requestingThreadProgressed).toBe(false);
    });
});

test("multiple intercepts will resolve after another. After all intercepts complete, the request and wait will continue", (done) => {
    function* requestingThread() {
        const val = yield bp.request("A", delay(100, 'super'));
        expect(val).toBe('super duper flowcards');
    }
    function* interceptingThread() {
        const intercept = yield bp.intercept("A");
        expect(intercept.value).toBe('super duper');
        intercept.resolve('super duper flowcards');
    }
    function* interceptingThreadHigherPriority() {
        const intercept = yield bp.intercept("A");
        expect(intercept.value).toBe('super');
        intercept.resolve('super duper');
    }
    function* waitingThread() {
        const val = yield bp.wait("A");
        expect(val).toBe('super duper flowcards');
        yield bp.wait('fin');
    }
    scenarios((enable) => {
        enable(requestingThread);
        enable(interceptingThread);
        enable(interceptingThreadHigherPriority); // this BThread is enabled after the first interceptingThread, giving it a higher priority
        enable(waitingThread);
    }, ({dispatch}) => {
        if(dispatch('fin')) {
            done();
        }  
    });
});


test("if the last intercept rejects, the event will resolve to its starting value.", (done) => {
    function* requestingThread() {
        const val = yield bp.request("A", delay(100, 'super'));
        expect(val).toBe('super'); // will have the initial value
    }
    function* interceptingThread() {
        const intercept = yield bp.intercept("A");
        expect(intercept.value).toBe('super duper');
        intercept.reject();
    }
    function* interceptingThreadHigherPriority() {
        const intercept = yield bp.intercept("A");
        expect(intercept.value).toBe('super');
        intercept.resolve('super duper');
    }
    function* waitingThread() {
        const val = yield bp.wait("A");
        expect(val).toBe('super');
        yield bp.wait('fin');
    }
    scenarios((enable) => {
        enable(requestingThread);
        enable(interceptingThread);
        enable(interceptingThreadHigherPriority); // this BThread is enabled after the first interceptingThread, giving it a higher priority
        enable(waitingThread);
    }, ({dispatch}) => {
        if(dispatch('fin')) {
            done();
        }  
    });
});


test("if the previous intercept rejects, the next intercept will get the initial value", (done) => {
    function* requestingThread() {
        const val = yield bp.request("A", delay(100, 'super'));
        expect(val).toBe('super duper'); // it will have the value for the last intercept
    }
    function* interceptingThread() {
        const intercept = yield bp.intercept("A");
        expect(intercept.value).toBe('super');
        intercept.resolve(intercept.value + ' duper');
    }
    function* interceptingThreadHigherPriority() {
        const intercept = yield bp.intercept("A");
        expect(intercept.value).toBe('super');
        intercept.reject();
    }
    function* waitingThread() {
        const val = yield bp.wait("A");
        expect(val).toBe('super duper');
        yield bp.wait('fin');
    }
    scenarios((enable) => {
        enable(requestingThread);
        enable(interceptingThread);
        enable(interceptingThreadHigherPriority); // this BThread is enabled after the first interceptingThread, giving it a higher priority
        enable(waitingThread);
    }, ({dispatch}) => {
        if(dispatch('fin')) {
            done();
        }  
    });
});