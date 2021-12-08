// import { Flow } from "../src";
// import * as bp from "../src/bid";
// import { FlowEvent } from "../src/flow-event";
// import { testScenarios } from "./testutils";

// test("the logger will provide a map of relevant Scenarios", () => {

//     const basicEvent = {
//         eventA: new FlowEvent<number>('A'),
//         eventB: new FlowEvent<number>('B'),
//         eventC: new FlowEvent<number>('C'),
//         eventD: new FlowEvent('D')
//     }

//     const requestingThread = new Flow('requestingThread', function*() {
//         yield [bp.request(basicEvent.eventC, 1), bp.request(basicEvent.eventA, 1)];
//         yield bp.askFor(basicEvent.eventD);
//     });
//     const waitingThread = new Flow('waitingThread', function*() {
//         yield bp.waitFor(basicEvent.eventA);
//     });
//     const relevantBlock = new Flow('relevantBlock', function*() {
//         yield bp.block(basicEvent.eventC);
//     });
//     const notRelevantBlock = new Flow('notRelevantBlock', function*() {
//         yield bp.block(basicEvent.eventB);
//     });
//     const notRelevantValidation = new Flow('notRelevantValidation', function*() {
//         yield bp.validate(basicEvent.eventB, (v) => v !== undefined && v > 0);
//     });
//     const relevantValidation = new Flow('relevantValidation', function*() {
//         yield bp.validate(basicEvent.eventA, (v) => v !== undefined && v > 0);
//     });
//     const relevantTrigger = new Flow('relevantTrigger', function*() {
//         yield bp.trigger(basicEvent.eventD);
//     });
//     const notRelevantTrigger = new Flow('notRelevantTrigger', function*() {
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
