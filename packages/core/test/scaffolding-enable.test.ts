// import * as bp from "../src/bid";
// import { testScenarios, delay } from './testutils';
// import { BTContext, BThreadState } from '../src/bthread';
// import { flow } from '../src/scenario';

// test("a thread will accept an optional array of arguments", () => {
//     let receivedArgs = ["", "", ""];
//     interface MyProps {a: string; b: string; c: string}

//     const thread = flow(null, function* (props: MyProps) {
//         receivedArgs = [props.a, props.b, props.c];
//         yield bp.wait('event');
//     })

//     testScenarios((enable) => {
//         enable(thread({a: 'A', b: 'B', c: 'C'}));
//     });

//     expect(receivedArgs[0]).toBe("A");
//     expect(receivedArgs[1]).toBe("B"); 
//     expect(receivedArgs[2]).toBe("C"); 
// });


// test("a thread will accept an optional key", () => {
//     let receivedKeyA, receivedKeyB;

//     const thread = flow(null, function* (this: BTContext) {
//         receivedKeyA = this.key;
//         yield bp.wait('A');
//     });

//     const threadB = flow(null, function* (this: BTContext) {
//         receivedKeyB = this.key;
//         yield bp.wait('A');
//     });

//     testScenarios((enable) => {
//         enable(thread(undefined, 0));
//         enable(threadB(undefined, 'foo'));
//     });

//     expect(receivedKeyA).toBe(0); 
//     expect(receivedKeyB).toBe("foo");
// });



// test("if no key is provided, the default key value is undefined", () => {
//     let receivedKeyA;

//     const thread = flow(null, function* (this: BTContext) {
//         receivedKeyA = this.key;
//         yield bp.wait('A');
//     });

//     testScenarios((enable) => {
//         enable(thread());
//     });

//     expect(receivedKeyA).toBeUndefined(); 
// });

// test("enable will return the current thread waits", () => {
//     let threadState: BThreadState;

//     const thread = flow(null, function* (this: BTContext) {
//         yield bp.wait('A');
//     });

//     testScenarios((enable) => {
//         threadState = enable(thread());
//         expect(threadState?.waits.has('A')).toBe(true);
//     });
// });


// test("enable will return the current thread blocks", () => {
//     let threadState: BThreadState;

//     const thread = flow(null, function* (this: BTContext) {
//         yield bp.block('A');
//     });

//     testScenarios((enable) => {
//         threadState = enable(thread());
//         expect(threadState?.blocks.has('A')).toBe(true);
//     });
// });


// test("enable will return the current thread-section", () => {
//     let threadState: BThreadState;

//     const thread = flow(null, function* (this: BTContext) {
//         this.section('my state value');
//         yield bp.wait('A');
//     });

//     testScenarios((enable) => {
//         threadState = enable(thread());
//         expect(threadState?.section).toEqual('my state value');
//     });
// });


// test("enable will return the the state of completion", () => {
//     let threadState: BThreadState;

//     const thread = flow(null, function* (this: BTContext) {
//         this.section('my state value');
//         yield bp.request('A');
//     });

//     testScenarios((enable) => {
//         threadState = enable(thread());
//     }, () => {
//         expect(threadState?.isCompleted).toEqual(true);
//     });
// });

// test("the section will be deleted if the thread completes", () => {
//     let threadState: BThreadState;

//     const thread = flow(null, function* (this: BTContext) {
//         this.section('my state value');
//         yield bp.request('A');
//     });

//     testScenarios((enable) => {
//         threadState = enable(thread());
//     }, () => {
//         expect(threadState?.isCompleted).toEqual(true);
//         expect(threadState?.section).toBeUndefined();
//     });
// });


// test("enable will return the current pending events and a isPending function", (done) => {
//     const thread1 = flow({id: 'thread1'}, function* () {
//         yield [bp.request("A", delay(100)), bp.request("B", delay(100))];
//     });

//     let enableReturn: BThreadState;

//     testScenarios((enable) => {
//         enableReturn = enable(thread1());
//     }, ({pending}) => {
//         if(pending.has('A') && pending.has('B')) {
//             expect(enableReturn.requests.has('A')).toBeFalsy();
//             expect(enableReturn.requests.has('B')).toBeFalsy();
//             done();
//         }
//     });
// });

// test("enable will return the current requesting events ( blocked and pending included )", (done) => {
//     const thread1 = flow({id: 'thread1'}, function* () {
//         yield [bp.request("A", delay(100)), bp.request("B")];
//     });

//     const thread2 = flow(null, function*() {
//         yield bp.block('B');
//     })

//     let enableReturn: BThreadState;

//     testScenarios((enable) => {
//         enableReturn = enable(thread1());
//         enable(thread2());
//     }, ({pending}) => {
//         if(pending.has('A')) {
//             expect(enableReturn.requests.has('A')).toBeFalsy();
//             expect(enableReturn.requests.has('B')).toBeTruthy();
//             done();
//         }
//     });
// });


// test("a BThread is destroyed, if the flow is not enabled and the destroy-flag is set to true", (done) => {
//     let thread2init = 0;
//     let thread1init = 0;

//     const thread1 = flow({id: 'thread1'}, function* () {
//         yield bp.request("B");
//         yield bp.request('X');
//         yield bp.wait("FIN");
//     });

//     const thread2 = flow({id: 'thread2', destroyOnDisable: true}, function*() {
//         thread2init++
//         yield bp.wait('B');
//         yield bp.wait('C');
//     })

//     const thread3 = flow({id: 'thread3', destroyOnDisable: false}, function*() {
//         thread1init++
//         yield bp.wait('B');
//         yield bp.wait('C');
//     })

//     testScenarios((enable) => {
//         const enableReturn = enable(thread1());
//         if(enableReturn.requests?.has('B') || enableReturn.waits?.has('FIN')) {
//             enable(thread2());
//             enable(thread3());
//         }
//     }, ({state, dispatch}) => {
//         if(dispatch('B')) {
//             expect(thread1init).toBe(1);
//             expect(thread2init).toBe(2);
//             expect(state['thread3']?.waits?.has('C')).toBeTruthy();
//             expect(state['thread2']?.waits?.has('B')).toBeTruthy();
//             done();
//         }
//     });
// });