import * as bp from "../src/index";
import { testScenarios } from './testutils';
import { BTContext } from '../src/index';
import { CachedItem } from '../build/update-loop';

function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
test("if an eventCache is present, it can be used as an argument in a request-function", () => {

    function* thread1(this: BTContext) {
        yield bp.request('A', 1);
        yield bp.request('A', (current: number) => current+1);
    }

    testScenarios((enable, cache) => {
        cache('A');
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
    testScenarios((enable, cache) => {
        cache('A');
        enable(thread1);
    }, ({dispatch, latest}) => {
        if(dispatch('fin')) {
            expect(latest('A')).toEqual("resolved value");
            done();
        }
    });
});


test("the event cache can have an initial value", () => {

    function* thread1(this: BTContext) {
        yield bp.request('A', (current: number) => current+1);
    }

    testScenarios((enable, cache) => {
        cache('A', 100);
        enable(thread1);
    }, ({latest}) => {
        expect(latest('A')).toEqual(101);
    });
    
});


test("the event cache function returns a reference", () => {

    function* thread1(this: BTContext, ref: bp.CachedItem<any>) {
        yield bp.request('A', (current: number) => current+1);
        yield bp.request('A', (current: number) => current+1);
        yield bp.request('A', (current: number) => current+1);
        expect(ref.current).toEqual(102); // the reference is updated, but the Thread is not reset.
    }

    testScenarios((enable, cache) => {
        const ref = cache('A', 100);
        enable(thread1, [ref]);
    }, ({latest}) => {
        expect(latest('A')).toEqual(103);
    });
});



test("if a request has no value, it will return the last cached value", () => {
    let val: number;
    function* thread1(this: BTContext) {
        val = yield bp.request('A');
    }
    testScenarios((enable, cache) => {
        cache('A', 100);
        enable(thread1);
    }, () => {
        expect(val).toEqual(100);
    });
});


test("a cache is only updated, if the request value is not undefined", () => {
    let val: number;
    let cachedVal: any;
    function* thread1(this: BTContext) {
        val = yield bp.request('A', undefined);
    }
    testScenarios((enable, cache) => {
        cachedVal = cache('A', 100);
        enable(thread1);
    }, () => {
        expect(cachedVal.current).toEqual(100);
    });
});