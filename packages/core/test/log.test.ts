// import * as bp from "../src/bid";
// import { testScenarios } from './testutils';
// import { flow } from '../src/scenario';
// import { delay } from './testutils';
// import { BTContext } from '../src/bthread';

// test("log will contain a list of executed actions (sorted)", () => {
//     const flow1 = flow(
//         {
//           id: "flow1",
//           title: "user is able to select a product"
//         },
//         function*(this: BTContext) {
//           this.section("productList");
//           const id = yield bp.wait("selectProduct");
//           const item = yield bp.request("apiGetProductDetails", "testData");
//           yield bp.set({ name: "productDetails", key: id }, item);
//           this.section("productDetails");
//           yield bp.wait("acceptAGB");
//           this.section("new Section");
//           yield bp.set("agbAccepted", "true");
//         }
//       );
      
//       const flow2 = flow(
//         {
//           id: "flow2",
//           title: "count actions"
//         },
//         function*() {
//             yield bp.request("selectProduct");
//             yield bp.trigger("acceptAGB");
//         }
//       );

//       testScenarios((enable) => {
//         enable(flow1());
//         enable(flow2());
//     }, ({actionLog}) => {
//         expect(actionLog?[0].event.name).toBe('selectProduct');
//         expect(actionLog?[1].event.name).toBe('apiGetProductDetails');
//         expect(actionLog?[2].event.name).toBe('productDetails');
//         expect(actionLog?[3].event.name).toBe('acceptAGB');
//         expect(actionLog?[4].event.name).toBe('agbAccepted');
//     });
// })

// test("the actions in a log will contain info, if and when the promise got resolved.", (done) => {

//   const thread1 = flow({name: 'thread1', title: 'myThread1'}, function* () {
//       yield bp.request('asyncRequest', () => delay(10, 'value'));
//       yield bp.request('request2');
//       yield bp.wait('fin');
//   });

//   testScenarios((enable) => {
//       enable(thread1());
//   }, ({actionLog, dispatch}) => {
//     if(dispatch('fin')) {
//       expect(log?[1]?.).toEqual('value');
//       expect(log?[1]?.resolve?.requestedActionIndex).toEqual(0);
//       expect(log?[1]?.resolve?.requestDuration).toBeGreaterThan(8);
//       done();
//     }
//   });
// });



// // add test for current.isCompleted
// // add test for current.pendingEvents