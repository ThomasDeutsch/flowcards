/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from './testutils';
import { BTContext } from '../src/index';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test("if an eventCache is present, it can be used as an argument in a request-function", () => {
    let x:any;

    function* thread1(this: BTContext) {
        yield bp.request('state', (previous: number) => previous + 1)
    }

    scenarios((enable, state) => {
        state('state', 5);
        enable(thread1);
    }, ({state}) => {
        expect(state('state')).toEqual(6);
    });
});