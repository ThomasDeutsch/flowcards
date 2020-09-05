// import * as bp from "../src/bid";
// import { testScenarios, delay } from './testutils';
// import { flow } from "../src/scenario";

// test("an extend can be resolved in the same cycle", () => {

//     const requestingThread = flow(null, function* () {
//         const val: number = yield bp.wait("A");
//     });

//     const blockingThread = flow(null, function* () {
//         yield bp.block("A", (x: number) => {
//             return x > 0 ? {isValid: true, details: "value is correct"} : {isValid: false, details: "value needs to be bigger than 0"};
//         });
//     });

//     testScenarios((enable) => {
//         enable(requestingThread());
//         enable(blockingThread());
//     }, ({explain}) => {
//         expect(explain('A', 10)).toBe(true);
//     });
// });


// TODO: a block is expained!
// TODO: a guarded block is explained

// TODO: THE BTHREADSTATEMAP WILL HOLD STATES OF EVENTS THAT ARE DISABLED OR COMPLETED!