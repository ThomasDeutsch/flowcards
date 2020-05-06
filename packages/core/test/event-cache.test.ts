/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from './testutils';
import { BTContext } from '../src/index';

function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
test("if an eventCache is present, it can be used as an argument in a request-function", () => {
    let x:any;

    function* thread1(this: BTContext) {
        yield bp.request('A', 1);
        yield bp.request('A', (current: number) => current+1);
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({latest}) => {
        expect(latest('A')).toEqual(2);
    });
    
});


test("when a promise resolved, the event cache gets updated", (done) => {
    function* thread1() {
        yield bp.request("A", delay(100, 'resolved value'));
        yield bp.wait('fin');
    }
    scenarios((enable) => {
        enable(thread1);
    }, ({dispatch, latest}) => {
        if(dispatch('fin')) {
            console.log('A: ', latest('A'))
            expect(latest('A')).toEqual("resolved value");
            done();
        }
    });
});