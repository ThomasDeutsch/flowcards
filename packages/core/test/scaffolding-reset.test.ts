import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { BTContext, BThreadState } from '../src/bthread';
import { flow } from '../src/flow';


test("a thread gets reset, when the arguments change", () => {
    let initCount = 0;
    const threadA = flow(null, function* () {
        yield [bp.request('A'), bp.wait('B')];
        yield bp.wait('fin');
    });

    interface MyProps {waitingForB: boolean}
    const threadB = flow({id: 'threadB'}, function* (props: MyProps) {
        initCount++;
        yield bp.wait('A');
    }); 

    testScenarios((enable) => {
        const state = enable(threadA());
        enable(threadB({waitingForB: state.waits.has('B')}));
    }, ({log}) => {
        const threadBReactions = log?.bThreadInfoById['threadB'].reactions;
        expect(threadBReactions?.get(0)?.changedProps?.[0]).toEqual('waitingForB');
        
    });


    expect(initCount).toBe(2);
});

test("a thread gets reset, when the arguments change - 2", () => {
    let initCount = 0;
    const threadA = flow(null, function* () {
        yield [bp.request('A'), bp.wait('B')];
        yield bp.wait('fin');
    });

    interface MyProps {waitingForB: boolean; waitingForX?: boolean}
    const threadB = flow({id: 'threadB'}, function* (props: MyProps) {
        initCount++;
        yield bp.wait('A');
    }); 

    testScenarios((enable) => {
        const state = enable(threadA());
        const test: MyProps = state.waits.has('B') ? {waitingForB: state.waits.has('B')} : {waitingForB: false, waitingForX: false};
        enable(threadB(test));
    }, ({log}) => {
        const threadBReactions = log?.bThreadInfoById['threadB'].reactions;
        expect(threadBReactions?.get(0)?.changedProps?.[0]).toEqual('waitingForB');
        expect(threadBReactions?.get(0)?.changedProps?.[1]).toEqual('waitingForX');
        
    });


    expect(initCount).toBe(2);
});

test("a thread gets reset, when the arguments change - 3", () => {
    let initCount = 0;
    const threadA = flow(null, function* () {
        yield [bp.request('A'), bp.wait('B')];
        yield bp.wait('fin');
    });

    interface MyProps {waitingForB: boolean; waitingForX?: boolean}
    const threadB = flow({id: 'threadB'}, function* (props: MyProps) {
        initCount++;
        yield bp.wait('A');
    }); 

    testScenarios((enable) => {
        const state = enable(threadA());
        const test = state.waits.has('B') ? {waitingForB: state.waits.has('B')} : undefined;
        enable(threadB(test));
    }, ({log}) => {
        const threadBReactions = log?.bThreadInfoById['threadB'].reactions;
        expect(threadBReactions?.get(0)?.changedProps?.[0]).toEqual('waitingForB');
        
    });


    expect(initCount).toBe(2);
});

test("a state from another thread is a fixed Ref-Object. Passing this Object will not reset a receiving thread", () => {
    let initCount = 0;
    let receivedValue;
    
    const threadA = flow(null, function* (this: BTContext) {
        this.section('foo');
        yield bp.request('A');
        yield bp.wait('B');
    });

    const threadB = flow(null, function* ({stateFromThreadA}) {
        initCount++;
        yield bp.wait('A');
        receivedValue = stateFromThreadA.section;
    })

    testScenarios((enable) => {
        const state = enable(threadA());
        enable(threadB({stateFromThreadA: state}));  // instead of state.current, we will pass state.
    });

    expect(initCount).toBe(1);
    expect(receivedValue).toBe('foo');
});




// todo: when a thread resets, all pending events are removed as well (requests and extends)
// todo: when a thread resets, its state will be reset as well.
// todo: get BThreadState