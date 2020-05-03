/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from "./testutils";

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test("a state can be created that will listen for requests in its name", () => {
    function* thread1() {
        yield bp.request("count", 2);
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({latest}) => {
        expect(latest("count")).toEqual(2);
    });
});


test("a state will return a ref. Passed to a function, it will not update on change", () => {
    let st: any;
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
        yield bp.wait('forever');;
    }

    scenarios((enable, cache) => {
        st = cache("count");
        enable(thread1);
        enable(thread2, [st]);
        enable(thread3, [st.current]);
    }, (scenario) => {
        expect(scenario.latest("count")).toEqual(2);
        expect(threadRefInit).toEqual(1);
        expect(threadValueInit).toEqual(2);
        expect(st.current).toEqual(2);
    });
});

test("if there are multiple state changes at the same time, the highest priority change will win.", () => {

    function* threadLow() {
        yield bp.request("count", 2);
    }
    function* threadHigh() {
        yield bp.request("count", 1000);
    }

    scenarios((enable, state) => {
        state("count");
        enable(threadLow);
        enable(threadHigh);
    }, ({latest}) => {
        expect(latest("count")).toEqual(1000);
    });
});


test("the state function will also return the previous value", () => {
    let st: any;

    function* thread() {
        yield bp.request("count", 1);
        yield bp.request("count", 2);
    }

    scenarios((enable, state) => {
        st = state("count");
        enable(thread);
    }, () => {
        expect(st.previous).toEqual(1);
    });
});


test("state changes can not be triggered by dispatch. Only threads can change states", () => {
    scenarios((enable, state) => {
        state("count");
    }, (scenario) => {
        expect(scenario.dispatch('count')).toBeUndefined();
    });
});



test("ispending will show what events are pending", () => {
    function* thread1() {
        yield bp.request("count", () => delay(2000));
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({latest, isPending}) => {
        expect(isPending("count")).toEqual(true);
        expect(latest("count")).toBeUndefined();
    });
});