import { Event } from "../../core/event.ts";
import { Flow } from "../../core/flow.ts";
import { when, set, given } from "../../core/bid.ts";
import { ActionAndReactions, Engine, FlowGeneratorFunction, InputAction, Placed, TestResult, WhenBid, actionReactionTester } from "../../core/index.ts";
import { deadline } from "$std/async/deadline.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deferred } from "https://deno.land/std@0.50.0/async/deferred.ts";

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

export const tests: TestRecord = {
    // 'a when-bid enables the dispatch function for an event': function() {
    //     const eventA = new Event<number>('eventA');
    //     const eventB = new Event<number>('eventB');
    //     return {
    //         rootFlow: function*(this: Flow) {
    //             yield set(eventB, 1);
    //             const b = yield* given(eventB);
    //             assertEquals(b, 1);
    //             yield when(eventA, (x) => x > 10);
    //         },
    //         replay: [
    //           {
    //             action: undefined,
    //             reactions: [ { flowPath: [ "rootFlow" ], type: "flow enabled", details: {} } ],
    //             tests: {
    //               "eventA is not enabled, and can not be dispatched": (engine: Engine) => {
    //                   assertEquals(eventA.value, undefined);
    //                   assertEquals(eventA.rootFlowId, undefined);
    //                   assertEquals(eventA.isValid(10), false);
    //                   assertEquals(eventA.isPending, false);
    //               }
    //             }
    //           },
    //           {
    //             action: {
    //               id: 0,
    //               type: "requested",
    //               eventId: "eventB",
    //               payload: 1,
    //               bidId: 0,
    //               flowPath: [ "rootFlow" ]
    //             },
    //             reactions: [
    //               {
    //                 flowPath: [ "rootFlow" ],
    //                 type: "flow progressed on a bid",
    //                 details: { bidId: 0, bidType: "set", eventId: "eventB", actionId: 0 }
    //               },
    //               {
    //                 flowPath: [ "rootFlow" ],
    //                 type: "flow progressed on a bid",
    //                 details: { bidId: 1, bidType: "given", eventId: "eventB" }
    //               },
    //               {
    //                 flowPath: [ "rootFlow" ],
    //                 type: "an active given was added",
    //                 details: { eventId: "eventB" }
    //               }
    //             ],
    //             tests: {
    //               "eventB should have a value of 1": (engine: Engine) => {
    //                 assertEquals(eventB.value, 1);
    //               },
    //               "eventA should be enabled": (engine: Engine) => {
    //                 assertEquals(eventA.value, undefined);
    //                 assertEquals(eventA.isValid(11), true);
    //                 assertEquals(eventA.rootFlowId, engine.rootFlow.id);
    //                 assertEquals(eventA.isPending, false);
    //                 try {
    //                   eventA.dispatch(8);
    //                 }
    //                 catch(e) {
    //                   assertEquals(e.message, 'event can not be dispatched because of an invalid payload');
    //                 }


    //               }
    //               // TODO: hier ein dispatch möglich, um den dispatch zu testen?
    //             }
    //           },
    //           {
    //             action: {
    //               type: "input",
    //               eventId: "eventA",
    //               payload: 11,
    //               flowPath: [ "rootFlow" ],
    //               id: 1,
    //               bidId: 2
    //             },
    //             reactions: [
    //               {
    //                 flowPath: [ "rootFlow" ],
    //                 type: "flow progressed on a bid",
    //                 details: { bidId: 2, bidType: "when", eventId: "eventA", actionId: 1 }
    //               },
    //               { flowPath: [ "rootFlow" ], type: "flow ended", details: {} }
    //             ],
    //             tests: {
    //               "eventA should have a value of 11": (engine: Engine) => {
    //                 assertEquals(eventA.value, 11);
    //               }
    //             }
    //           }
    //         ]
    //     } satisfies TestCase
    // },
    'a set-bid can call an async function': function() {
        const eventA = new Event<number>('eventA');
        return {
            rootFlow: function*(this: Flow) {
                const a = yield set(eventA, () => delay(1000, 1));
                assertEquals(eventA.value, 1);
            },
            replay: [
              {
                action: undefined,
                reactions: [ { flowPath: [ "rootFlow" ], type: "flow enabled", details: {} } ]
              },
              {
                action: {
                  id: 0,
                  type: "requestedAsync",
                  eventId: "eventA",
                  bidId: 0,
                  flowPath: [ "rootFlow" ]
                },
                reactions: [
                  {
                    flowPath: [ "rootFlow" ],
                    type: "pending request added",
                    details: { eventId: "eventA", bidId: 0, bidType: "set", actionId: 0 }
                  }
                ]
              },
              {
                action: {
                  id: 1,
                  eventId: "eventA",
                  type: "resolvePendingRequest",
                  flowPath: [ "rootFlow" ],
                  bidId: 0,
                  payload: 1,
                  requestActionId: 0
                },
                reactions: [
                  {
                    flowPath: [ "rootFlow" ],
                    type: "pending request resolved",
                    details: { eventId: "eventA", actionId: 0 }
                  },
                  {
                    flowPath: [ "rootFlow" ],
                    type: "flow progressed on a bid",
                    details: { bidId: 0, bidType: "set", eventId: "eventA", actionId: 1 }
                  },
                  { flowPath: [ "rootFlow" ], type: "flow ended", details: {} }
                ]
              }
            ]
        } satisfies TestCase
    },
 }

 export type TestRecord = {[key:string]: () => TestCase};
 export type TestCase = { rootFlow: FlowGeneratorFunction, replay?: ActionAndReactions[] };
 async function runTest({rootFlow, replay}: TestCase) {
    const useMocks = replay !== undefined;
    const deferredTestResult = deferred<{recorded: ActionAndReactions[], result: TestResult, engine: Engine}>();
    new Engine({
        id: 'rootFlow',
        rootFlow,
        createTester: (engine: Engine) => actionReactionTester(engine, useMocks, [...(replay || [])], deferredTestResult.resolve)
    }).run();
    await deadline(deferredTestResult, 3000);
    return deferredTestResult;
}

function createInputAction(engine: Engine, bid: Placed<WhenBid<any, any>>): InputAction<any> {
    return {
        type: 'input',
        eventId: bid.event.id,
        payload: 'some payload',
        flowPath: bid.flow.path,
        id: engine.currentActionId + 1,
        bidId: bid.id
    }
}

Deno.test('tests', async () => {
    for(const [name, test] of Object.entries(tests)) {
        const setupTest = test();
        const finishedTest = await runTest(setupTest);
        if(setupTest.replay === undefined || setupTest.replay.length === 0) {
            console.log('new recoreded test: ', finishedTest.recorded);
            assertEquals(1, 2);
        }
        if(finishedTest.engine.whenBids.length > 0) {
            // test complete? waiting for
            console.warn('are you missing waiting bids?: ', finishedTest.engine.whenBids.map(b => createInputAction(finishedTest.engine, b)));
        }
        if(finishedTest.result === 'invalid reactions') {
          // show differences
          console.error('invalid reactions: ', finishedTest.recorded);
          throw new Error('invalid reactions');
        }
        assertEquals(finishedTest.engine.whenBids.length, 0);
        assertEquals(finishedTest.result, 'completed');
    }
});