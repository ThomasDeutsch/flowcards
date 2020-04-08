/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as bp from "../src/bid";
import { BTContext } from '../src/bthread';
import { scenarios, BThreadState } from '../src/index';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test("the enable function will return the current thread state", () => {
    function* thread() {
        yield bp.wait('event');
    }

    scenarios((enable) => {
        const state = enable(thread);
        
        expect(state.isCompleted).toBe(false);
        expect(state.nrProgressions).toBe(0); 
        expect(state.pendingEvents).toEqual(new Set());
        expect(state.value).toBeUndefined();
    }, null);
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

    scenarios((enable) => {
        state = enable(thread);
        state2 = enable(thread2);
    }, null);

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
    function* thread(this: BTContext) {
        this.setState('foo');
        yield bp.request("A");
    }

    scenarios((enable) => {
        state = enable(thread);
    }, null);

    if(state) {
        expect(state.isCompleted).toBe(true);
        expect(state.nrProgressions).toBe(1);
        expect(state.value).toEqual('foo');
    }
});


test("a thread state is always the same Object.", (done) => {
    let previous:any;

    function* thread1(this: BTContext) {
        this.setState(0);
        yield [bp.request("asyncRequest", () => delay(100)), bp.wait("A")];
        this.setState(1);
        yield bp.wait("B");
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({bThreadState}) => {
        if(bThreadState.thread1.value !== 1) previous = bThreadState.thread1;
        else {
            expect(Object.is(previous, bThreadState.thread1)).toBeTruthy();
            done();
        }
    });
});

test("a setState argument can be a function", () => {

    function* thread1(this: BTContext) {
        this.setState(1);
        yield bp.request("event");
        this.setState((a: number) => a + 1);
        yield bp.wait("B");
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({bThreadState}) => {
        expect(bThreadState.thread1.value).toEqual(2);
    });
});


test("a state value can be accessed from the thread itself", () => {
    let state: BThreadState;
    
    function* thread1(this: BTContext) {
        this.setState(1);
        yield bp.request("event");
        state = this.state;
    }

    scenarios((enable) => {
        enable(thread1);
    }, () => {
        expect(state.value).toEqual(1);
    });
});