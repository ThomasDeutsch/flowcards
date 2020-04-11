// /* eslint-disable @typescript-eslint/explicit-function-return-type */
// /* eslint-disable @typescript-eslint/no-explicit-any */

// import * as bp from "../src/bid";
// import { scenarios, StagingFunction, DispatchedAction, createUpdateLoop } from '../src/index';

// function delay(ms: number) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }

// test("scenarios can be used without updateCb and logger", done => {
//     function* thread1() {
//         yield bp.request("A", delay(1000));
//         done();
//     }

//     scenarios((enable) => {
//         enable(thread1);
//     }, (scenario) => {
//         expect(scenario.bThreadState.thread1.nrProgressions).toEqual(1);
//     });
// });

// test("there will be a dispatch-function every waiting event", () => {

//     function* thread1() {
//         yield [bp.wait("eventOne"), bp.wait("eventTwo")];
//     }

//     function* thread2() {
//         yield bp.wait("eventThree");
//     }

//     scenarios((enable) => {
//         enable(thread1);
//         enable(thread2);
//     }, (scenario) => {
//         expect(scenario.dispatch.eventOne).toBeDefined();
//         expect(scenario.dispatch.eventTwo).toBeDefined();
//         expect(scenario.dispatch.eventThree).toBeDefined();
//     });
// });


// function loggerScenarios(stagingFunction: StagingFunction, da: Set<string>): void {
//     const updateLoop = createUpdateLoop(stagingFunction, (a: DispatchedAction): void => {
//         if(a.payload) da.add(a.payload.eventName);
//         updateLoop(a);   
//     });
//     updateLoop(null);
// }

// test("if a request is rejected, it will fire no update", done => {
//     const dispatchedActions = new Set<string>();
    
//     function* thread1() {
//         yield bp.request("cancel", delay(100));
//     }
//     function* thread2() {
//         const [type] = yield [bp.request('async-event', delay(500)), bp.wait('cancel')];
//         expect(type).toEqual('cancel');
//         yield bp.request("async-event-two", delay(1000));
//         expect(dispatchedActions.has('async-event')).toEqual(false);
//         done();
//     }
//     loggerScenarios((enable) => {
//         enable(thread1);
//         enable(thread2);
//     }, dispatchedActions);
// });