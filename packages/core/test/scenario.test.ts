/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios, BTContext } from '../src/index';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test("scenarios can be used without updateCb and logger", done => {
    function* thread1() {
        yield bp.request("A", delay(1000));
        done();
    }

    scenarios((enable) => {
        enable(thread1);
    }, (scenario) => {
        expect(scenario.thread["thread1"].nrProgressions).toEqual(1);
    });
});

test("there will be a dispatch-function every waiting event", () => {

    function* thread1() {
        yield [bp.wait("eventOne"), bp.wait("eventTwo")];
    }

    function* thread2() {
        yield bp.wait("eventThree");
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, (scenario) => {
        expect(scenario.dispatch.eventOne).toBeDefined();
        expect(scenario.dispatch.eventTwo).toBeDefined();
        expect(scenario.dispatch.eventThree).toBeDefined();
    });
});