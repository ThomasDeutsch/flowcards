import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { BThreadContext } from '../src/bthread';
import { scenario } from '../src/scenario';


test("a thread gets reset, when the arguments change", () => {
    let initCount = 0;
    const threadA = scenario(null, function* () {
        yield [bp.request('A'), bp.askFor('B')];
        yield bp.askFor('fin');
    });

    interface MyProps {waitingForB?: boolean}
    const threadB = scenario({id: 'threadB'}, function* (props: MyProps) {
        initCount++;
        yield bp.askFor('A');
    }); 

    testScenarios((enable) => {
        const state = enable(threadA());
        enable(threadB({waitingForB: state.bids?.askFor.has('B')}));
    }, () => {
        expect(initCount).toBe(2);
    });
});

test("a thread gets reset, when the arguments change - 2", () => {
    let initCount = 0;
    const threadA = scenario(null, function* () {
        yield [bp.request('A'), bp.askFor('B')];
        yield bp.askFor('fin');
    });

    interface MyProps {waitingForB: boolean; waitingForX?: boolean}
    const threadB = scenario({id: 'threadB'}, function* (props: MyProps) {
        initCount++;
        yield bp.askFor('A');
    }); 

    testScenarios((enable) => {
        const state = enable(threadA());
        const test: MyProps = state.bids?.askFor.has('B') ? {waitingForB: state.bids?.askFor?.has('B')} : {waitingForB: false, waitingForX: false};
        enable(threadB(test));
    }, () => {
        expect(initCount).toBe(2);    
    });
});

test("a thread gets reset, when the arguments change - 3", () => {
    let initCount = 0;
    const threadA = scenario(null, function* () {
        yield [bp.request('A'), bp.askFor('B')];
        yield bp.askFor('fin');
    });

    interface MyProps {waitingForB: boolean; waitingForX?: boolean}
    const threadB = scenario({id: 'threadB'}, function* (props: MyProps) {
        initCount++;
        yield bp.askFor('A');
    }); 

    testScenarios((enable) => {
        const state = enable(threadA());
        const test = state.bids?.askFor?.has('B') ? {waitingForB: state.bids?.askFor.has('B')} : undefined;
        enable(threadB(test));
    }, () => {
        expect(initCount).toBe(2);
    });


    
});

test("a state from another thread is a fixed Ref-Object. Passing this Object will not reset a receiving thread", () => {
    let initCount = 0;
    let receivedValue;
    
    const threadA = scenario(null, function* (this: BThreadContext) {
        this.section('foo');
        yield bp.request('A');
        yield bp.askFor('B');
    });

    const threadB = scenario(null, function* ({stateFromThreadA}) {
        initCount++;
        yield bp.askFor('A');
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