/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from "./testutils";

test("keys can be a string or a number", () => {
    function* thread1() {
        yield bp.wait({name: 'A', key: "1"});
    }

    function* thread2() {
        yield bp.wait({name: 'A', key: 2});
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, ({dispatch})=> {
        expect(dispatch({name: 'A', key: "1"})).toBeDefined();
        expect(dispatch({name: 'A', key: 1})).toBeUndefined();
        expect(dispatch({name: 'A', key: 2})).toBeDefined();
        expect(dispatch({name: 'A', key: "2"})).toBeUndefined();
    });
});


test("an event with a key can be blocked.", () => {
    let advancedKey1 = false;
    let advancedKey2 = false;

    function* thread1() {
        yield bp.wait({name: 'A', key: 1});
        advancedKey1 = true;
    }

    function* thread2() {
        yield bp.wait({name: 'A', key: 2});
        advancedKey2 = true;
    }

    function* blockingThread() {
        yield bp.block({name: 'A', key: 1});
    }

    function* requestingThread() {
        yield bp.request('A'); // request all A events
    }



    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
        enable(blockingThread);
        enable(requestingThread);
    }, ({dispatch})=> {
        expect(advancedKey1).toEqual(false);
        expect(advancedKey2).toEqual(true);
    });
});


test("a request without a key will advance all waiting threads ( with key or not )", () => {
    let advancedWait1 = false;
    let advancedWait2 = false;
    let advancedWaitNoKey = false;

    function* waitThreadWithKey1() {
        yield bp.wait({name: 'A', key: 1});
        advancedWait1 = true;
    }
    function* waitThreadWithKey2() {
        yield bp.wait({name: 'A', key: 2});
        advancedWait2 = true;
    }

    function* waitThreadWithoutKey() {
        yield bp.wait({name: 'A'});
        advancedWaitNoKey = true;
    }

    function* requestThread() {
        yield bp.request('A');
    } 

    scenarios((enable) => {
        enable(waitThreadWithKey1);
        enable(waitThreadWithKey2);
        enable(waitThreadWithoutKey);
        enable(requestThread);
    }, ()=> {
        expect(advancedWaitNoKey).toEqual(true);
        expect(advancedWait1).toEqual(true);
        expect(advancedWait2).toEqual(true);
    });
});


test("a request with a key, will only advance the matching wait with the same key, and waits without a key", () => {
    let advancedWait1 = false;
    let advancedWait2 = false;
    let advancedWaitNoKey = false;

    function* waitThreadWithKey1() {
        yield bp.wait({name: 'A', key: 1});
        advancedWait1 = true;
    }
    function* waitThreadWithKey2() {
        yield bp.wait({name: 'A', key: 2});
        advancedWait2 = true;
    }

    function* waitThreadWithoutKey() {
        yield bp.wait({name: 'A'});
        advancedWaitNoKey = true;
    }

    function* requestThread() {
        yield bp.request({name: 'A', key: 1});
    } 

    scenarios((enable) => {
        enable(waitThreadWithKey1);
        enable(waitThreadWithKey2);
        enable(waitThreadWithoutKey);
        enable(requestThread);
    }, ()=> {
        expect(advancedWait1).toEqual(true);
        expect(advancedWait2).toEqual(false);
        expect(advancedWaitNoKey).toEqual(true);

    });
});


test("an event cache vor an event will contain keyed values as well", () => {
    function* thread1() {
        yield bp.request({name: 'A', key: "1"}, 'a value for 1');
    }

    function* thread2() {
        yield bp.request({name: 'A', key: 2}, 'a value for 2');
    }

    scenarios((enable, cache) => {
        cache('A');
        enable(thread1);
        enable(thread2);
    }, ({latest})=> {
        expect(latest({name: 'A', key: "1"})).toEqual('a value for 1');
        expect(latest({name: 'A', key: 2})).toEqual('a value for 2');
    });
});


test("if an event cache has keyed values, they will be replaced by a request without key", () => {
    function* thread1() {
        yield bp.request({name: 'A', key: "1"}, 'a value for 1');
    }

    function* thread2() {
        yield bp.wait({name: 'A', key: "1"});
        yield bp.request({name: 'A', key: 2}, 'a value for 2');
        yield bp.request('A', 'replacement value')
    }

    scenarios((enable, cache) => {
        cache('A');
        enable(thread1);
        enable(thread2);
    }, ({latest})=> {
        expect(latest({name: 'A', key: "1"})).toEqual('replacement value');
        expect(latest({name: 'A', key: 2})).toEqual('replacement value');
    });
});
