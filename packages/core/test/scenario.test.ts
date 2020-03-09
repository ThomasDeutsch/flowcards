/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { ScaffoldingFunction } from '../src/update-loop';
import { Logger } from "../src/logger";
import { scenarios } from '../src/index';

type TestLoop = (enable: ScaffoldingFunction) => Logger;

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


test("scenarios can be used without updateCb and logger", done => {
    function* thread1() {
        yield bp.request("A", delay(1000));
        done();

    }
    const dispatch = scenarios((enable) => {
        enable(thread1);
    }, (a:any): void => console.log('HEY', a));
    console.log('dispatch: ', dispatch);
    expect(dispatch).toBeDefined();
});