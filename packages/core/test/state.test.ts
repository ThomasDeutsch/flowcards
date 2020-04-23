// /* eslint-disable @typescript-eslint/explicit-function-return-type */
// /* eslint-disable @typescript-eslint/no-explicit-any */

// import * as bp from "../src/bid";
// import { scenarios, BTContext } from '../src/index';


// test("a state can be created that will listen for requests in its name", done => {
//     let st: any;

//     function* thread1() {
//         yield bp.request("count", 2);
//         done();
//     }

//     scenarios((enable, state) => {
//         st = state("count", 0);
//         enable(thread1);
//     }, (scenario) => {
//         expect(scenario.state["count"]).toEqual(2);
//         expect(st.current).toEqual(2);
//     });
// });


// test("a state will return a ref. Passed to a function, it will not update on change", () => {
//     let st: any;
//     let threadRefInit = 0;
//     let threadValueInit = 0;

//     function* thread1() {
//         yield bp.request("count", 2);
//     }

//     function* thread2() { // this thread will receive the state ref
//         threadRefInit++;
//         yield null;
//     }

//     function* thread3() { // this thread will receive the state value
//         threadValueInit++;
//         yield null;
//     }

//     scenarios((enable, state) => {
//         st = state("count", 0);
//         enable(thread1);
//         enable(thread2, [st]);
//         enable(thread3, [st.current]);
//     }, (scenario) => {
//         expect(scenario.state["count"]).toEqual(2);
//         expect(threadRefInit).toEqual(1);
//         expect(threadValueInit).toEqual(2);
//         expect(st.current).toEqual(2);
//     });
// });



// test("if a state is not enabled, it is deleted", () => {

//     function* thread1(this: BTContext) {
//         this.setState(1);
//         yield bp.request("count", 2);
//         this.setState(0);
//         yield bp.request("test");
//         this.setState(1);
//     }

//     scenarios((enable, state) => {
//         const bThreadState = enable(thread1);
//         if(bThreadState.value === 1) {
//             state("count", 0);
//         }
//     }, (scenario) => {
//         expect(scenario.state["count"]).toEqual(0);
//     });
// });


// test("if there are multiple state changes at the same time, the highest priority change will win.", () => {

//     function* threadLow() {
//         yield bp.request("count", 2);
//     }
//     function* threadHigh() {
//         yield bp.request("count", 1000);
//     }

//     scenarios((enable, state) => {
//         state("count", 0);
//         enable(threadLow);
//         enable(threadHigh);
//     }, (scenario) => {
//         expect(scenario.state["count"]).toEqual(1000);
//     });
// });


// test("the state function will also return the previous value", () => {
//     let st: any;

//     function* thread() {
//         yield bp.request("count", 1);
//         yield bp.request("count", 2);
//     }

//     scenarios((enable, state) => {
//         st = state("count", 0);
//         enable(thread);
//     }, () => {
//         expect(st.previous).toEqual(1);
//     });
// });


// test("state changes can not be triggered by dispatch. Only threads can change states", () => {
//     scenarios((enable, state) => {
//         state("count", 0);
//     }, (scenario) => {
//         expect(scenario.dispatch["count"]).toBeUndefined();
//     });
// });

