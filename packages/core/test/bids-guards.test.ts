/* eslint-disable @typescript-eslint/explicit-function-return-type */

import * as bp from "../src/bid";
import { scenarios } from '../src/index';


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
        expect(log.latestAction.eventId).toBe("A");
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
        expect(log.latestAction.eventId).toBe("A");
    });
});

