/* eslint-disable @typescript-eslint/explicit-function-return-type */

import * as bp from "../src/bid";
import { scenarios } from '../src/index';
import { last } from '../src/utils';



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
        expect(last(log.actionsAndReactions).action.eventName).toBe("A");
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
        expect(last(log.actionsAndReactions).action.eventName).toBe("A");
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
        expect(requestAdvanced).toBe(true);
        expect(waitBAdvanced).toBe(false);
        expect(waitCAdvanced).toBe(true);
        expect(waitDAdvanced).toBe(false);
        expect(last(log.actionsAndReactions).action.eventName).toBe("A");
    });
});


test("a block is applied, if the guard returns true", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;
    let waitCAdvanced = false;


    function* threadA() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* threadB() {
        yield bp.block("A", (pl: number) => pl === 1000);
        waitBAdvanced = true;
    }

    function* threadC() {
        yield bp.wait("A");
        waitCAdvanced = true;
    }

    scenarios((enable) => {
        enable(threadA);
        enable(threadB);
        enable(threadC);
    }, null);

    expect(requestAdvanced).toBe(false);
    expect(waitBAdvanced).toBe(false);
    expect(waitCAdvanced).toBe(false);
});


test("a block is not applied, if the guard returns false", () => {
    let requestAdvanced = false;
    let waitAdvanced = false;


    function* threadA() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* threadB() {
        yield bp.block("A", (pl: number) => pl !== 1000);
    }

    function* threadC() {
        yield bp.wait("A");
        waitAdvanced = true;
    }

    scenarios((enable) => {
        enable(threadA);
        enable(threadB);
        enable(threadC);
    }, null);

    expect(requestAdvanced).toBe(true);
    expect(waitAdvanced).toBe(true);
});


test("guards for blocks will be merged", () => {
    let requestAdvanced = false;
    let waitAdvanced = false;


    function* requestThread() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* blockingThreadA() {
        yield bp.block("A", (pl: number) => pl === 1000);
    }

    function* blockingThreadB() {
        yield bp.block("A", (pl: number) => pl !== 1000);
    }

    function* waitingThread() {
        yield bp.wait("A");
        waitAdvanced = true;
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(blockingThreadA);
        enable(blockingThreadB);
        enable(waitingThread);
    }, null);

    expect(requestAdvanced).toBe(false);
    expect(waitAdvanced).toBe(false);
});


test("if there is a block without a guard, the guard will be ignored", () => {
    let requestAdvanced = false;
    let waitAdvanced = false;


    function* requestThread() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* blockingThreadA() {
        yield bp.block("A", (pl: number) => pl !== 1000);
    }

    function* blockingThreadB() {
        yield bp.block("A");
    }

    function* waitingThread() {
        yield bp.wait("A");
        waitAdvanced = true;
    }

    scenarios((enable) => {
        enable(requestThread);
        enable(blockingThreadA);
        enable(blockingThreadB);
        enable(waitingThread);
    }, null);

    expect(requestAdvanced).toBe(false);
    expect(waitAdvanced).toBe(false);
});