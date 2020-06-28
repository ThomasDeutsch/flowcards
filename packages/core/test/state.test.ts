import * as bp from "../src/index";
import { testScenarios } from "./testutils";
import { flow } from '../src/flow';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test("a state can be created that will listen for requests in its name", () => {
    const thread1 = flow(null, function* () {
        yield bp.request("count", 2);
    })

    testScenarios((enable, cache) => {
        cache('count');
        enable(thread1([]));
    }, ({latest}) => {
        expect(latest("count")).toEqual(2);
    });
});


test("a state will return a ref. Passed to a function, it will not update on change", () => {
    let threadRefInit = 0;
    let threadValueInit = 0;

    const thread1 = flow(null, function* () {
        yield bp.request("count", 2);
    })

    const thread2 = flow(null, function* (value: any) { // this thread will receive the state ref
        threadRefInit++;
        yield bp.wait('forever');
    });

    const thread3 = flow(null, function* (value: any) { // this thread will receive the state value
        threadValueInit++;
        yield bp.wait('forever');
    });

    testScenarios((enable, cache) => {
        const st = cache("count");
        enable(thread1([]));
        enable(thread2([st]));
        enable(thread3([st.current]));
    }, (scenario) => {
        expect(scenario.latest("count")).toEqual(2);
        expect(threadRefInit).toEqual(1);
        expect(threadValueInit).toEqual(2);
    });
});

test("if there are multiple state changes at the same time, one will be requested first (the higher priority one).", () => {

    const threadLow = flow(null, function* () {
        yield bp.request("count", 2);
    });

    const threadHigh= flow(null, function* () {
        yield bp.request("count", 1000);
    });

    let cacheHistory: any[] = [];

    testScenarios((enable, cache) => {
        const countCache = cache("count");
        cacheHistory = countCache.history;
        enable(threadLow([]));
        enable(threadHigh([]));
    }, ({latest}) => {
        expect(latest("count")).toEqual(2);
        expect(cacheHistory.length).toEqual(3); // initial, 1000, 2
        expect(cacheHistory[1]).toEqual(1000);
    });
});

test("the cache-update can hold the intercepted value", () => {

    const thread = flow(null, function* () {
        yield bp.request("count", 2);
    });

    const thread2 = flow(null, function* () {
        yield bp.intercept("count", undefined, (val: number) => val + 2);
    });

    testScenarios((enable, cache) => {
        cache('count');
        enable(thread([]));
        enable(thread2([]));
    }, ({latest}) => {
        expect(latest('count')).toEqual(4);
    });
});


test("state changes can not be triggered by dispatch. Only threads can change states", () => {
    testScenarios((enable, state) => {
        state("count");
    }, (scenario) => {
        expect(scenario.dispatch('count')).toBeUndefined();
    });
});



test("isPending will show what events are pending", () => {
    const thread1 = flow(null, function* () {
        yield bp.request("count", () => delay(2000));
    });

    testScenarios((enable, cache) => {
        cache('count');
        enable(thread1([]));
    }, ({latest, isPending}) => {
        expect(isPending("count")).toEqual(true);
        expect(latest("count")).toBeUndefined();
    });
});

test("isPending will accept a key as a second argument", () => {
    const thread1 = flow(null, function* () {
        yield bp.request({name: "count", key: 1}, () => delay(2000));
    });

    testScenarios((enable, cache) => {
        cache('count');
        enable(thread1([]));
    }, ({latest, isPending}) => {
        expect(isPending({name: "count", key: 1})).toEqual(true);
        expect(latest({name: "count", key: 1})).toBeUndefined();
    });
});