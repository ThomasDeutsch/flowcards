/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios, BTContext } from '../src/index';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test("dispatch is always the same Object.", (done) => {
    let x:any;

    function* thread1(this: BTContext) {
        yield [bp.request("asyncRequest", () => delay(100)), bp.wait("A")];
        yield bp.wait("B");
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({dispatch}) => {
        if(dispatch('A')) x = dispatch;
        else {
            expect(Object.is(x, dispatch)).toBeTruthy();
            done();
        }
    });
});

test("dispatch[eventId] is the same Object, as long as there is a wait", (done) => {
    let x: any;
    let y: any;

    function* thread1(this: BTContext) {
        yield [bp.request("asyncRequest", () => delay(100)), bp.wait("X"), bp.wait("A")];
        yield [bp.request("asyncRequest", () => delay(100)), bp.wait("Y"), bp.wait("A")];
        yield [bp.request("asyncRequest", () => delay(100)), bp.wait("Z")];
        yield [bp.wait("FIN"), bp.wait("A")];
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({dispatch}) => {
        if(dispatch('X')) x = dispatch('A');
        if(dispatch('Y')) y = dispatch('A');
        if(dispatch("FIN")) {
            expect(Object.is(x, y)).toBeTruthy();
            expect(Object.is(x, dispatch("A"))).toBeFalsy();
            done();  
        }  
    });
});


test("A guarded dispatch will return undefined if the value is not valid", (done) => {
    let x: any;
    let y: any;
    let firstDispatch: any;

    function* thread1(this: BTContext) {
        yield [bp.request("asyncRequest1", () => delay(100)), bp.wait("X"), bp.wait("A", (x:any) => x > 1)];
        yield [bp.request("asyncRequest2", () => delay(100)), bp.wait("Y"), bp.wait("A", (x:any) => x < 1)];
        yield [bp.wait("FIN"), bp.wait("A")];
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({dispatch}) => {
        if(dispatch("X")) {
            x = dispatch("A", 0);
        }
        else if(dispatch("Y")) y = dispatch('A', 0);
        else {
            expect(x).not.toEqual(y);
            expect(x).toBeUndefined();
            done();  
        }  
    });
});


test("the evaluated dispatch function is a different Object, when the guard Function changes", (done) => {
    let x: any;
    let y: any;

    function* thread1(this: BTContext) {
        yield [bp.request("asyncRequest1", () => delay(100)), bp.wait("X"), bp.wait("A")];
        yield [bp.request("asyncRequest2", () => delay(100)), bp.wait("Y"), bp.wait("A")];
        yield [bp.wait("FIN"), bp.wait("A")];
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({dispatch}) => {
        if(dispatch("X")) x = dispatch("A", 1);
        if(dispatch("Y")) y = dispatch("A", 2);
        if(dispatch("FIN")) {
            expect(Object.is(x, y)).toBeFalsy();
            const same = (Object.is(y, dispatch("A", 2)));
            expect(same).toEqual(true);
            done();  
        }  
    });
});


test("the evaluated dispatch function is the same Object, for every key/payload combination", (done) => {
    let x: any;
    let y: any;

    function* thread1(this: BTContext) {
        yield [bp.request("asyncRequest", () => delay(100)), bp.wait("X"), bp.wait("A")];
        yield [bp.request("asyncRequest", () => delay(100)), bp.wait("Y"), bp.wait("A")];
        yield [bp.wait("FIN"), bp.wait("A")];
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({dispatch}) => {
        if(dispatch("X")) x = dispatch({name: 'A', key: 'key1'}, 1);
        if(dispatch("Y")) y = dispatch({name: 'A', key: 'key2'}, 2);
        if(dispatch("FIN")) {
            expect(Object.is(x, dispatch({name: 'A', key: 'key1'}, 1))).toBeTruthy();
            expect(Object.is(y, dispatch({name: 'A', key: 'key2'}, 2))).toBeTruthy();
            done();  
        }  
    });
});

/** 
* waits können mit einem oder mehreren keys dispatched werden.
* waits können allgemein dispatched werden ( alle keys )
*/