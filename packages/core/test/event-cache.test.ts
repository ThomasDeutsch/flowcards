import * as bp from "../src/index";
import { scenarios } from './testutils';
import { BTContext } from '../src/index';

function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
test("if an eventCache is present, it can be used as an argument in a request-function", () => {

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
            expect(latest('A')).toEqual("resolved value");
            done();
        }
    });
});


test("the event cache can have an initial value", () => {

    function* thread1(this: BTContext) {
        yield bp.request('A', (current: number) => current+1);
    }

    scenarios((enable, cache) => {
        cache('A', 100);
        enable(thread1);
    }, ({latest}) => {
        expect(latest('A')).toEqual(101);
    });
    
});


test("the event cache function returns a reference", () => {

    function* thread1(this: BTContext, ref: bp.Ref<any>) {
        yield bp.request('A', (current: number) => current+1);
        yield bp.request('A', (current: number) => current+1);
        yield bp.request('A', (current: number) => current+1);
        expect(ref.current).toEqual(102); // the reference is updated, but the Thread is not reset.
    }

    scenarios((enable, cache) => {
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
    scenarios((enable, cache) => {
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
    scenarios((enable, cache) => {
        cachedVal = cache('A', 100);
        enable(thread1);
    }, () => {
        expect(cachedVal.current).toEqual(100);
    });
});