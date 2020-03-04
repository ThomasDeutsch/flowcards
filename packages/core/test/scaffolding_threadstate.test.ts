import bp from "../src/bid";
import { createUpdateLoop, ScaffoldingFunction, UpdateLoopFunction } from '../src/updateloop';
import { Logger } from "../src/logger";
import { ThreadContext, ThreadState } from '../src/bthread';

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
        expect(state.pendingEvents).toBeUndefined();
        expect(state.value).toBeUndefined();
    });
});


test("if promises are pending, the thread will return a set of those pending promises", () => {
    let state: any, state2: any;

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

    expect(state.isCompleted).toBe(false);
    expect(state.nrProgressions).toBe(1); 
    expect(state.pendingEvents).toEqual(new Set(["A"]));
    expect(state.value).toBeUndefined();
    expect(state2.nrProgressions).toBe(2); 
    expect(state2.pendingEvents).toEqual(new Set(["C", "D"]));
});


test("the thread will return the state value, and a completed-flag if the thread completes", () => {
    let state: any;

    function* thread(this: ThreadContext) {
        this.setState('foo');
        yield bp.request("A");
    }

    updateLoop((enable) => {
        state = enable(thread);
    });

    expect(state.isCompleted).toBe(true);
    expect(state.nrProgressions).toBe(1);
    expect(state.value).toEqual('foo');
});