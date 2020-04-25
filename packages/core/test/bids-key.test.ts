/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from "../src/index";
import { FCEvent } from "../src/event";


test("The key can be a string or a number", () => {
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


// test("a bid can have multiple keys", () => {
//     function* thread1() {
//         yield bp.wait({name: 'A', key: [1, 2]});
//     }

//     scenarios((enable) => {
//         enable(thread1);
//     }, ({dispatch})=> {
//         expect(dispatch({name: 'A', key: 1})).toBeDefined();
//         expect(dispatch({name: 'A', key: 2})).toBeDefined();
//     });
// });


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