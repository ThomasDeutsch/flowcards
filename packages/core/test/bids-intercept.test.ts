/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from "../src/index";
import { ActionType } from '../src/action';


function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
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


test("an intercept will create a pending event", () => {
    function* thread1() {
        yield bp.request("A", delay(100));
    }
    function* interceptingThreadx() {
        yield bp.intercept("A");
    }
    scenarios((enable) => {
        enable(thread1);
        enable(interceptingThreadx);
    }, ({log}) => {
        expect(log.currentPendingEvents.has('A')).toBe(true);
    });
});


test("an intercept can be resolved. This will progress waits and requests", (done) => {
    function* thread1() {
        const val = yield bp.request("A", delay(100, 'super'));
        expect(val).toBe('super duper');
    }
    function* interceptingThready() {
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
        enable(thread1);
        enable(interceptingThready);
        enable(waitingThread);
    }, ({dispatch}) => {
        if(dispatch.fin) {
            done();
        }  
    });
});


test("an intercept can be rejected. This will remove the pending event", (done) => {
    function* thread1() {
        const val = yield bp.request("A", delay(100, 'super'));
        expect(val).toBe('super');
    }
    function* interceptingThreadz() {
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
        enable(thread1);
        enable(interceptingThreadz);
        enable(waitingThread);
    }, ({dispatch}) => {
        if(dispatch.fin) {
            done();
        }  
    });
});



// test: if a requested thread has completed, it will not release the pending requests.

// intercept:
// test: an intercept will create a pending event
// test: if an intercept thread has completed, it will not release the intercepted events.
// test: if an async request is intercepted, the intercept will wait for the request to resolve or reject
// test: if an intercept will intercept another intercept, it will do so if the first intercept has resolved or rejected the pending-event