import * as bp from "../src/index";
import { testScenarios } from "./testutils";

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test("a state can be created that will listen for requests in its name", () => {
    function* thread1() {
        yield bp.request("count", 2);
    }

    testScenarios((enable, cache) => {
        cache('count');
        enable(thread1);
    }, ({latest}) => {
        expect(latest("count")).toEqual(2);
    });
});


test("a state will return a ref. Passed to a function, it will not update on change", () => {
    let threadRefInit = 0;
    let threadValueInit = 0;

    function* thread1() {
        yield bp.request("count", 2);
    }

    function* thread2() { // this thread will receive the state ref
        threadRefInit++;
        yield bp.wait('forever');
    }

    function* thread3() { // this thread will receive the state value
        threadValueInit++;
        yield bp.wait('forever');
    }

    testScenarios((enable, cache) => {
        const st = cache("count");
        enable(thread1);
        enable(thread2, [st]);
        enable(thread3, [st.current]);
    }, (scenario) => {
        expect(scenario.latest("count")).toEqual(2);
        expect(threadRefInit).toEqual(1);
        expect(threadValueInit).toEqual(2);
    });
});

test("if there are multiple state changes at the same time, the highest priority change will win.", () => {

    function* threadLow() {
        yield bp.request("count", 2);
    }
    function* threadHigh() {
        yield bp.request("count", 1000);
    }

    testScenarios((enable, state) => {
        state("count");
        enable(threadLow);
        enable(threadHigh);
    }, ({latest}) => {
        expect(latest("count")).toEqual(1000);
    });
});

test("the latest-function will respect the intercept value", () => {

    function* thread() {
        yield bp.request("count", 2);
    }

    function* thread2() {
        yield bp.intercept("count", undefined, (val: number) => val + 2);
    }

    testScenarios((enable, cache) => {
        cache('count');
        enable(thread);
        enable(thread2);
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
    function* thread1() {
        yield bp.request("count", () => delay(2000));
    }

    testScenarios((enable, cache) => {
        cache('count');
        enable(thread1);
    }, ({latest, isPending}) => {
        expect(isPending("count")).toEqual(true);
        expect(latest("count")).toBeUndefined();
    });
});

test("isPending will accept a key as a second argument", () => {
    function* thread1() {
        yield bp.request({name: "count", key: 1}, () => delay(2000));
    }

    testScenarios((enable, cache) => {
        cache('count');
        enable(thread1);
    }, ({latest, isPending}) => {
        expect(isPending({name: "count", key: 1})).toEqual(true);
        expect(latest({name: "count", key: 1})).toBeUndefined();
    });
});