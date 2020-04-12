/* eslint-disable @typescript-eslint/explicit-function-return-type */

import * as bp from "../src/bid";
import { scenarios } from '../src/index';


// Todo: if a request value is guarded, it will still continue, but not the wait or intercept.


test("a wait is not advanced, if the guard returns false", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;
    let waitCAdvanced = false;


    function* threadA() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* threadB() {
        yield bp.wait("A", (pl: number) => pl !== 1000);
        waitBAdvanced = true;
    }

    function* threadC() {
        yield bp.wait("A", (pl: number) => pl === 1000);
        waitCAdvanced = true;
    }
    scenarios((enable) => {
        enable(threadA);
        enable(threadB);
        enable(threadC);
    }, ({log}) => {
        expect(requestAdvanced).toBe(true);
        expect(waitBAdvanced).toBe(false);
        expect(waitCAdvanced).toBe(true);
        expect(log.latestAction.eventName).toBe("A");
    });
});


test("an intercept is not applied, if the guard returns false.", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;
    let waitCAdvanced = false;


    function* threadA() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* threadB() {
        yield bp.wait("A", (pl: number) => pl === 1000);
        waitBAdvanced = true;
    }

    function* threadC() {
        yield bp.intercept("A", (pl: number) => pl !== 1000);
        waitCAdvanced = true;
    }

    scenarios((enable) => {
        enable(threadA);
        enable(threadB);
        enable(threadC);
    }, ({log}) => {
        expect(requestAdvanced).toBe(true);
        expect(waitBAdvanced).toBe(true);
        expect(waitCAdvanced).toBe(false);
        expect(log.latestAction.eventName).toBe("A");
    });
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
        expect(requestAdvanced).toBe(false);
        expect(waitBAdvanced).toBe(false);
        expect(waitCAdvanced).toBe(true);
        expect(waitDAdvanced).toBe(false);
        expect(log.currentPendingEvents.has("A")).toBe(true);
        expect(log.latestAction.eventName).toBe("A");
    });
});