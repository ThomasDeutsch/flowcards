// import * as bp from "../src/bid";
// import { testScenarios, delay } from './testutils';
// import { ActionType } from '../src/action';
// import { flow } from '../src/scenario';

// test("a thread can be replayed", (done) => {
//     let value1: number, value2: number;
//     const thread1 = flow({name: 'thread1'}, function* () {
//         yield bp.wait('HEY');
//         value1 = yield bp.request("A", () => delay(100, 1));
//         value2 = yield bp.wait("B");
//         yield bp.wait('fin');
//     });
//     const [context, dispatch, replay] = testScenarios((enable) => {
//         enable(thread1());
//     }, ({dispatch}) => {
//         if(dispatch('fin')) {
//             expect(value1).toEqual(1);
//             expect(value2).toEqual(3);
//             done();
//         }
//     });
//     replay([
//         {index: 0, type: ActionType.dispatched, threadId: '', event: {name: 'HEY'}},
//         {index: 1, type: ActionType.requested, threadId: 'thread1', event: {name: 'A'}, payload: undefined},
//         {index: 2, type: ActionType.resolved, threadId: 'thread1', event: {name: 'A'}, payload: 1},
//         {index: 3, type: ActionType.dispatched, threadId: 'thread1', event: {name: 'B'}, payload: 3}])
   
// });

// test("if a request-replay has no payload, the original payload will be used", (done) => {
//     let value1: number;
//     const thread1 = flow({name: 'thread1'}, function* () {
//         yield bp.wait('replayEvent1');
//         value1 = yield bp.request("replayEvent2", 5);
//         yield bp.wait('fin');
//     });
//     const [context, dispatch, replay] = testScenarios((enable) => {
//         enable(thread1());
//     }, ({dispatch}) => {
//         if(dispatch('fin')) {
//             expect(value1).toEqual(5);
//             done();
//         }
//     });
//     replay([
//         {index: 0, type: ActionType.dispatched, threadId: '', event: {name: 'replayEvent1'}},
//         {index: 1, type: ActionType.requested, threadId: 'thread1', event: {name: 'replayEvent2'}}])
// });


// test("a async request can be replayed", (done) => {
//     let value1: number;
//     let eventReplayed = false;
//     const thread1 = flow({name: 'thread1'}, function* () {
//         yield bp.wait('replayEvent1');
//         value1 = yield bp.request("replayEvent2", () => {
//             eventReplayed = true;
//             return delay(100, 'YEAH');
//         });
//         yield bp.wait('replayEvent3');
//         yield bp.wait('fin');
//     });
//     const [context, dispatch, replay] = testScenarios((enable) => {
//         enable(thread1());
//     }, ({dispatch}) => {
//         if(dispatch('fin')) {
//             expect(value1).toEqual('YEAH');
//             expect(eventReplayed).toBeTruthy();
//             done();
//         }
//     });
//     replay([
//         {index: 0, type: ActionType.dispatched, threadId: '', event: {name: 'replayEvent1'}},
//         {index: 1, type: ActionType.requested, threadId: 'thread1', event: {name: 'replayEvent2'}, resolvedActionIndex: 2},
//         // the index:2 action is missing ... this is where the resolve will be placed.
//         {index: 3, type: ActionType.dispatched, threadId: '', event: {name: 'replayEvent3'}}])
// });