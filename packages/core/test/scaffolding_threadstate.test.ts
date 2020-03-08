/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */


import * as bp from "../src/bid";
import { createUpdateLoop, ScaffoldingFunction } from '../src/updateloop';
import { Logger } from "../src/logger";
import { ThreadContext } from '../src/bthread';

type TestLoop = (enable: ScaffoldingFunction) => Logger;
let updateLoop: TestLoop;

beforeEach(() => {
    updateLoop = (enable: ScaffoldingFunction): Logger => {
        const logger = new Logger();
        createUpdateLoop(enable, () => null, logger)();
        return logger;
    };
});

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


test("the enable function will return the current thread state", () => {
    function* thread() {
        yield bp.wait('event');
    }

    updateLoop((enable) => {
        const state = enable(thread);
        
        expect(state.isCompleted).toBe(false);
        expect(state.nrProgressions).toBe(0); 
        expect(state.pendingEvents).toEqual(new Set());
        expect(state.value).toBeUndefined();
    });
});


test("if promises are pending, the thread will return a set of those pending promises", () => {
    let state: any = null;
    let state2: any = null;

    function* thread() {
        yield bp.request("A", delay(1000));
    }

    function* thread2() {
        yield [bp.request("C", delay(1000)), bp.request("D", delay(1100))]
    }

    updateLoop((enable) => {
        state = enable(thread);
        state2 = enable(thread2);
    });

    if(state && state2) {
        expect(state.isCompleted).toBe(false);
        expect(state.nrProgressions).toBe(1); 
        expect(state.pendingEvents).toEqual(new Set(["A"]));
        expect(state.value).toBeUndefined();
        expect(state2.nrProgressions).toBe(2); 
        expect(state2.pendingEvents).toEqual(new Set(["C", "D"]));
    }
});


test("the thread will return the state value, and a completed-flag if the thread completes", () => {
    let state: any = null
    function* thread(this: ThreadContext) {
        this.setState('foo');
        yield bp.request("A");
    }

    updateLoop((enable) => {
        state = enable(thread);
    });

    if(state) {
        expect(state.isCompleted).toBe(true);
        expect(state.nrProgressions).toBe(1);
        expect(state.value).toEqual('foo');
    }
    
    

});