import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { Scenario } from '../src/scenario'
import { delay } from './testutils';
import { ScenarioEvent } from "../src";


test("A function, returning a promise can be requested and will create a pending-event", (done) => {
    const eventA = new ScenarioEvent<number>('A');

    const thread1 = new Scenario({id: 'requestingThread'}, function* () {
        yield bp.request(eventA, () => delay(100, 10));
    });

    testScenarios((enable, events) => {
        events([eventA]);
        enable(thread1);
    }, () => {
        if(eventA.isPending) {
            expect(eventA.value).toBe(10);
            done();
        }
    });
});


test("multiple async-requests can be executed sequentially", (done) => {

    const eventWaitForCard = new ScenarioEvent<number>('Wait for Card');
    const eventValidateCard = new ScenarioEvent<number>('Validate Card');
    const eventLoadAccount = new ScenarioEvent<number>('Load Account');
    const eventWaitForPin = new ScenarioEvent<number>('Wait for Pin');

    let threadResetCounter = -1;

    const scenario1 = new Scenario('flow',
        function*() {
            threadResetCounter++;
            yield bp.request(eventWaitForCard, () => delay(10, 1));
            yield bp.request(eventValidateCard, () => delay(10, 2));
            yield bp.request(eventLoadAccount, () => delay(10, 3));
            yield bp.request(eventWaitForPin, () => delay(10, 4));
        }
    );

    testScenarios((enable,events) => {
        events([eventWaitForCard, eventValidateCard, eventLoadAccount, eventWaitForPin]);
        enable(scenario1);
    }, (() => {
        if(scenario1.isCompleted) {
            expect(threadResetCounter).toEqual(0);
            done();
        }
    }));
});


// test("for multiple active promises in one yield, only one resolve will progress the BThread", (done) => {
//     let progressed2 = false;
//     let progressed3 = false;

//     const thread1 = scenario({id: 'requestingThread'}, function* () {
//         yield [bp.request("HEYYA", () => delay(1000)), bp.request("HEYYB", () => delay(1000))];
//     });

//     const thread2 = scenario(null, function* () {
//         yield bp.askFor('HEYYA');
//         progressed2 = true;
//     });

//     const thread3 = scenario(null, function* () {
//         yield bp.askFor('HEYYB');
//         progressed3 = true;
//     });

//     testScenarios((enable) => {
//         enable(thread1());
//         enable(thread2());
//         enable(thread3());
//     }, ({scenario}) => {
//         if(scenario('requestingThread')?.isCompleted) {
//             expect(progressed2).not.toBe(progressed3);
//             done();
//         }
//     });
// });


// test("if a thread gets disabled, before the pending-event resolves, the pending-event resolve will still be dispatched", (done) => {
//     const thread1 = scenario({id: 'thread1'}, function* () {
//         yield bp.request("A", () => delay(100));
//         const bid = yield [bp.askFor('B'),  bp.request("X", () => delay(500))];
//         expect(bid.eventId.name).toEqual('B');
//     });

//     const thread2 = scenario({id: 'thread2'}, function*() {
//         yield bp.request("B", () => delay(300));
//     });

//     testScenarios((enable) => {
//         const t1 = enable(thread1());
//         if(t1.pendingBids.has('A')) {
//             enable(thread2());
//         }
//     }, (({scenario}) => {
//         if(scenario('thread1')?.isCompleted) {
//             expect(scenario('thread2')?.isCompleted).toBeTruthy();
//             done();
//         }
//     }));
// });

// test("given the destoryOnDisable option, pending events will be canceled on destroy", (done) => {
//     const thread1 = scenario({id: 'thread1'}, function* () {
//         yield bp.request("A", () => delay(100));
//         const bid = yield [bp.askFor('B'),  bp.request("X", () => delay(500))];
//         expect(bid.eventId.name).toEqual('X');
//     });

//     const thread2 = scenario({id: 'thread2', destroyOnDisable: true}, function*() {
//         yield bp.request("B", () => delay(300));
//     });

//     testScenarios((enable) => {
//         const t1 = enable(thread1());
//         if(t1.pendingBids.has('A')) {
//             enable(thread2());
//         }
//     }, (({scenario}) => {
//         if(scenario('thread1')?.isCompleted) {
//             expect(scenario('thread2')?.isCompleted).toBeFalsy();
//             done();
//         }
//     }));
// });


// test("a thread in a pending-event state can place additional bids.", (done) => {
//     const thread1 = scenario({id: 'requestingThread'}, function* (this: BThreadContext) {
//         yield [bp.request("A", () => delay(100)), bp.block('B')];
//     });

//     const thread2 = scenario({id: 'waitingThread'}, function* () {
//         yield bp.askFor('B');
//     });

//     testScenarios((enable) => {
//         enable(thread1());
//         enable(thread2());
//     }, ({event, scenario}) => {
//         if(event('A').isPending) {
//             expect(event('B').validate(1).isValid).toBe(false);
//         } else if( scenario('requestingThread')?.isCompleted) {
//             expect(event('B').validate().isValid).toBe(true);
//             done();
//         }
//     });
// });

// test("a canceled request will not progress a pending event with the same event-id", (done) => {
//     const thread1 = scenario({id: 'requestingThread'}, function* (this: BThreadContext) {
//         yield [bp.request("A", () => delay(200, '1')), bp.askFor('cancel')];
//         yield bp.request("B");
//         const x = yield bp.request("A", () => delay(500, '2'));
//         expect(x.payload).toBe('2');
//     });

//     const thread2 = scenario({id: 'cancelThread'}, function* () {
//         yield bp.trigger('cancel');
//     });

//     testScenarios((enable) => {
//         enable(thread1());
//         enable(thread2());
//     }, ({event, scenario}) => {
//         if(scenario('requestingThread')?.isCompleted) {
//             done();
//         }
//     });
// });


// // TODO: test: a resolve/reject can not be blocked


// test("a pending event can be canceled by calling cancelPending", (done) => {
//     const thread1 = scenario({id: 'requestingThread'}, function* (this: BThreadContext) {
//         try {
//             yield bp.request("A", () => delay(9999, '1'));
//         } catch(e) {
//             expect(e.error).toEqual('custom error message');
//             expect(e.event.name).toEqual('A');
//             done();
//         }
//     });

//     testScenarios((enable) => {
//         enable(thread1());
//     }, ({event}) => {
//         if(event('A')?.isPending) {
//             expect(event('A')?.cancelPending).toBeDefined();
//             event('A')?.cancelPending?.('custom error message');
//         }
//     });
// });
