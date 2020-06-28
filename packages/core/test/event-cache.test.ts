import * as bp from "../src/index";
import { testScenarios } from './testutils';
import { BTContext } from '../src/index';
import { flow } from '../src/flow';

function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

// todo: a cache is ony enabled when a cacheEnable on that event is called.
// todo: a cache is only updated with a request ( not a dispatch )

test("if an eventCache is present, it can be used as an argument in a request-function", () => {

    const thread1 = flow(null, function* () {
        yield bp.request('A', 1);
        yield bp.request('A', (current: number) => current+1);
    })

    testScenarios((enable, cache) => {
        cache('A');
        enable(thread1([]));
    }, ({latest}) => {
        expect(latest('A')).toEqual(2);
    });
    
});


test("when a promise resolved, the event cache gets updated", (done) => {
    const thread1 = flow(null, function* () {
        const val = yield bp.request("A", delay(100, 'resolved value'));
        console.log('A-resolved to be:', val)
        yield bp.wait('fin');
    });

    testScenarios((enable, cache) => {
        cache('A', null);
        enable(thread1([]));
    }, ({dispatch, latest}) => {
        if(dispatch('fin')) {
            console.log('FIN!!!!!!!!!!!!!!!!!!!!!!!', latest('A'))
            expect(latest('A')).toEqual("resolved value");
            done();
        }
    });
});


test("the event cache can have an initial value", () => {

    const thread1 = flow(null, function* (this: BTContext) {
        yield bp.request('A', (current: number) => current+1);
    })

    testScenarios((enable, cache) => {
        cache('A', 100);
        enable(thread1([]));
    }, ({latest}) => {
        expect(latest('A')).toEqual(101);
    });
    
});


test("the event cache function returns a reference", () => {

    const thread1 = flow(null, function* (this: BTContext, ref: bp.CachedItem<any>) {
        yield bp.request('A', (current: number) => current+1);
        yield bp.request('A', (current: number) => current+1);
        yield bp.request('A', (current: number) => current+1);
        expect(ref.current).toEqual(103); // the reference is updated, but the Thread is not reset.
    });

    testScenarios((enable, cache) => {
        const ref = cache('A', 100);
        enable(thread1([ref]));
    }, ({latest}) => {
        expect(latest('A')).toEqual(103);
    });
});


test("if a request has no value, it will return the last cached value", () => {
    let val: number;
    const thread1 = flow(null, function* (this: BTContext) {
        val = yield bp.request('A');
    });

    testScenarios((enable, cache) => {
        cache('A', 100);
        enable(thread1([]));
    }, () => {
        expect(val).toEqual(100);
    });
});


test("a cache is only updated, if the request value is not undefined", () => {
    let val: number;
    let cachedVal: any;
    
    const thread1 = flow(null, function* (this: BTContext) {
        val = yield bp.request('A', undefined);
    });

    testScenarios((enable, cache) => {
        cachedVal = cache('A', 100);
        enable(thread1([]));
    }, () => {
        expect(cachedVal.current).toEqual(100);
    });
});



test("a cache can be updated by the provided set function", () => {
    let val: number;
    let cachedVal: any;

    const thread1 = flow(null, function* (this: BTContext, cachedVal: any) {
        expect(cachedVal.current).toBe(10);
        val = yield bp.wait('fin');
    });

    testScenarios((enable, cache) => {
        cachedVal = cache('A', 100);
        cachedVal.set(10);
        expect(cachedVal.current).toEqual(10);
        enable(thread1([cachedVal]));
    }, () => {
        expect(cachedVal.current).toEqual(10);
    });
});


test("the cache can be reinitialized", () => {
    let cachedVal: any;
    
    const thread1 = flow(null, function* (this: BTContext, cachedVal: any) {
        cachedVal.set(10);
        cachedVal.reset();
        yield bp.request('fin');
    });

    testScenarios((enable, cache) => {
        cachedVal = cache('A', 100);
        enable(thread1([cachedVal]));
    }, () => {
        expect(cachedVal.current).toEqual(100);
    });
});


test("the cache will hold the initial value", () => {
    let cachedVal: any;

    const thread1 = flow(null, function* (this: BTContext, cachedVal: any) {
        cachedVal.set(10);
        expect(cachedVal.current).toBe(10);
        yield bp.request('fin');
    });

    testScenarios((enable, cache) => {
        cachedVal = cache('A', 100);
        enable(thread1([cachedVal]));
    }, () => {
        expect(cachedVal.current).toEqual(10);
        expect(cachedVal.initial()).toEqual(100);
    });
});


test("event cache will have record of past events (history)", () => {
    let cachedVal: any;

    const thread1 = flow(null, function* (this: BTContext, cachedVal: any) {
        cachedVal.set(10);
        cachedVal.set(20);
        cachedVal.set(30);
        yield bp.request('fin');
    });

    testScenarios((enable, cache) => {
        cachedVal = cache('A', 100);
        enable(thread1([cachedVal]));
    }, () => {
        expect(cachedVal.current).toEqual(30);
        expect(cachedVal.initial()).toEqual(100);
        expect(cachedVal.history[0]).toEqual(100);
        expect(cachedVal.history[1]).toEqual(10);
        expect(cachedVal.history[2]).toEqual(20);
        expect(cachedVal.history[3]).toEqual(30);
    });
});