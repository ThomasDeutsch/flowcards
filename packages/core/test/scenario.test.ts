/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from '../src/index';

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
        expect(scenario.state["thread1"].nrProgressions).toEqual(1);
    });
});
