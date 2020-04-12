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





// test: if a requested thread has completed, it will not release the pending requests.

// intercept:
// test: an intercept will create a pending event
// test: if an intercept thread has completed, it will not release the intercepted events.
// test: if an async request is intercepted, the intercept will wait for the request to resolve or reject
// test: if an intercept will intercept another intercept, it will do so if the first intercept has resolved or rejected the pending-event