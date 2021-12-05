// import { BThread } from "../src";
// import * as bp from "../src/bid";
// import { TEvent } from "../src/b-event";
// import { testScenarios } from "./testutils";

// test("the logger will provide a map of relevant Scenarios", () => {

//     const basicEvent = {
//         eventA: new TEvent<number>('A'),
//         eventB: new TEvent<number>('B'),
//         eventC: new TEvent<number>('C'),
//         eventD: new TEvent('D')
//     }

//     const requestingThread = new BThread('requestingThread', function*() {
//         yield [bp.request(basicEvent.eventC, 1), bp.request(basicEvent.eventA, 1)];
//         yield bp.askFor(basicEvent.eventD);
//     });
//     const waitingThread = new BThread('waitingThread', function*() {
//         yield bp.waitFor(basicEvent.eventA);
//     });
//     const relevantBlock = new BThread('relevantBlock', function*() {
//         yield bp.block(basicEvent.eventC);
//     });
//     const notRelevantBlock = new BThread('notRelevantBlock', function*() {
//         yield bp.block(basicEvent.eventB);
//     });
//     const notRelevantValidation = new BThread('notRelevantValidation', function*() {
//         yield bp.validate(basicEvent.eventB, (v) => v !== undefined && v > 0);
//     });
//     const relevantValidation = new BThread('relevantValidation', function*() {
//         yield bp.validate(basicEvent.eventA, (v) => v !== undefined && v > 0);
//     });
//     const relevantTrigger = new BThread('relevantTrigger', function*() {
//         yield bp.trigger(basicEvent.eventD);
//     });
//     const notRelevantTrigger = new BThread('notRelevantTrigger', function*() {
//         yield bp.trigger(basicEvent.eventB);
//     });

//     testScenarios((s, e) => {
//         e(basicEvent);
//         s(requestingThread);
//         s(waitingThread);
//         s(relevantBlock);
//         s(notRelevantBlock);
//         s(notRelevantValidation);
//         s(relevantValidation);
//         s(relevantTrigger);
//         s(notRelevantTrigger);
//     }, ({log})=> {
//         const threads = log.allRelevantScenarios;
//         expect(threads.has('requestingThread')).toBe(true);
//         expect(threads.has('waitingThread')).toBe(true);
//         expect(threads.has('relevantBlock')).toBe(true);
//         expect(threads.has('notRelevantBlock')).toBe(false);
//         expect(threads.has('notRelevantValidation')).toBe(false);
//         expect(threads.has('relevantValidation')).toBe(true);
//         expect(threads.has('relevantTrigger')).toBe(true);
//         expect(threads.has('notRelevantTrigger')).toBe(false);
//     });
// });
