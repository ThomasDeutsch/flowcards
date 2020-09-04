// import * as bp from "../src/index";
// import { testScenarios, delay } from "./testutils";
// import { flow } from '../src/scenario';

// test("an onPending-wait is progressed, when the event receives the pending state", (done) => {
//     let thread2completed = false;

//     const thread1 = flow(null, function* () {
//         yield bp.request("A", () => delay(100, "hey"));
//     })

//     const thread2 = flow(null, function* () {
//         yield bp.onPending("A");
//         thread2completed = true;
//     })

//     testScenarios((enable, ) => {
//         enable(thread1());
//         enable(thread2());
//     }, (x) => {
//         if(x.pending.has('A')) {
//             expect(thread2completed).toBeTruthy();
//             done();
//         }
//     });
// });


// test("an onPending-wait is not progressed on events that are not async", () => {
//     let thread2completed = false;

//     const thread1 = flow(null, function* () {
//         yield bp.request("A", "hey");
//     })

//     const thread2 = flow(null, function* () {
//         yield bp.onPending("A");
//         thread2completed = true;
//     })

//     testScenarios((enable, ) => {
//         enable(thread1());
//         enable(thread2());
//     }, (x) => {
//         expect(thread2completed).toBeFalsy();
//     });
// });
