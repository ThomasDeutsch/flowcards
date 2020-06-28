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

    const threadB = flow(null, function* (isWaitingForB: boolean) {
        initCount++;
        yield bp.wait('A');
    }); 

    testScenarios((enable) => {
        const state = enable(threadA([]));
        enable(threadB([state.isWaitingFor('B')]));
    });

    expect(initCount).toBe(2);
});


test("a state from another thread is a fixed Ref-Object. Passing this Object will not reset a receiving thread", () => {
    let initCount = 0;
    let receivedValue;
    
    const threadA = flow(null, function* (this: BTContext) {
        this.setState('foo');
        yield bp.request('A');
    });

    const threadB = flow(null, function* (stateFromThreadA: BThreadState) {
        initCount++;
        yield bp.wait('A');
        receivedValue = stateFromThreadA.current;
    })

    testScenarios((enable) => {
        const state = enable(threadA([]));
        enable(threadB([state]));  // instead of state.current, we will pass state.
    });

    expect(initCount).toBe(1);
    expect(receivedValue).toBe('foo');
});



// test("when a thread resets, the bids will be re-evaluated", () => {
//     let threadBCount = 0;
//     function* threadA(this: BTContext) {
//         yield bp.request('A');
//         this.setState(1);
//     }

//     function* threadB() {
//         threadBCount++;
//         yield bp.wait('A');
//     }

//     testScenarios((enable) => {
//         const threadAState = enable(threadA);
//         enable(threadB, [threadAState.current]);  // instead of state.current, we will pass state.
//     }, ({dispatch, bTState}) => {
//         expect(bTState.threadB.isCompleted === false);
//         expect(threadBCount).toEqual(2);
//         expect(dispatch('A')).toBeDefined();
//     });
// });


// todo: when a thread resets, its state will be reset as well.
// todo: get BThreadState