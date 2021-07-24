// import * as bp from "../src/bid";
// import { testScenarios } from "./testutils";
// import { scenario } from '../src/scenario';
// import { ScenarioEvent } from "../src/scenario-event";

// test("an event can have an initial value", () => {
//     const eventA = new ScenarioEvent('A', 10);

//     const requestingThread = scenario({id: 'thread1'}, function*() {
//         yield bp.request(eventA, (a) => (a || 0) + 1);
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread());
//     }, ()=> {
//         expect(eventA.value).toBe(11)
//     });
// });


// test("an event can have an additional validate function", () => {
//     const eventA = new ScenarioEvent<number>('A', 10);

//     const requestingThread = scenario({id: 'thread1'}, function*() {
//         yield bp.request(eventA, (a) => (a || 0) + 1);
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread());
//     }, ()=> {
//         expect(eventA.value).toBe(11);
//     });
// });

// test("an event can have an additional validate function", () => {
//     const eventA = new ScenarioEvent<number>('A', 10, (a) => a < 20);

//     const requestingThread = scenario({id: 'thread1'}, function*() {
//         yield bp.askFor(eventA);
//     });

//     testScenarios({eventA}, (enable) => {
//         enable(requestingThread());
//     }, ({scenario})=> {
//         expect(scenario('thread1')?.isCompleted).toBe(false);
//         expect(eventA.validate(20).isValid).toBe(false);
//         expect(eventA.validate(19).isValid).toBe(true);
//         expect(eventA.validate(20).failed.length).toBe(1);
//         expect(eventA.validate(20).passed.length).toBe(0);
//         expect(eventA.validate(20).failed[0].type).toBe("eventPayloadValidation");
//     });
// });
