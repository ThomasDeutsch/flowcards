import { Event } from "../src/event.ts";
import { runFlowcardsTests } from "./utils.ts";
import { Flow } from "../src/flow.ts";
import { askFor, request, given } from "../src/bid.ts";
import { delay } from "./test-utils.ts";
import { assert } from "https://deno.land/std@0.190.0/_util/asserts.ts";


Deno.test("givenTest", async (t) => {
  const eventA = new Event<number>('eventA');
  const eventB = new Event<number>('eventB');
  await runFlowcardsTests(t, function*(this: Flow) {
      this.flow('givenFlow', function*(this: Flow) {
          yield* given(eventA, (x) => x > 10);
          yield* given(eventB, (x) => x > 10);
          yield undefined
      });
      yield request(eventA, 20);
      yield request(eventB, 20);
      yield request(eventB, 10);
      yield undefined;
    }, {eventA, eventB}
  );
});

Deno.test("askForTest", async (t) => {
    const eventA = new Event<number>('eventA');
    await runFlowcardsTests(t, function*(this: Flow) {
        yield askFor(eventA);
    }, {eventA}, [
        {
          "reactions": [
            {
              "flowPath": [
                "rootFlow"
              ],
              "type": "flow enabled",
              "details": {}
            }
          ],
            "tests": [
                /**
                 * assert that the event is asked for
                 */
                (engine) => {
                    const x = engine.getAskForBids().find(b => b.event == eventA)
                    assert(x !== undefined);
                }
            ]
        },
        {"action": {
            type: "external",
            payload: 1,
            id: 0,
            eventId: 'eventA',
            flowPath: [
                "rootFlow"
              ],
            bidId: 0
        }}
      ]
    );
});


Deno.test("asyncRequestTest", async (t) => {
  const eventA = new Event<number>('eventA');
      const delayFn = () => delay(100, 1);
      let fnCalled = 0;
      await runFlowcardsTests(t, function*(this: Flow) {
          yield request(eventA, () => {
            fnCalled++;
            return delayFn();
          });
      }, {eventA}, [
        {
          "reactions": [
            {
              "flowPath": [
                "rootFlow"
              ],
              "type": "flow enabled",
              "details": {}
            }
          ]
        },
        {
          "action": {
            "id": 0,
            "type": "requestedAsync",
            "eventId": "eventA",
            "bidId": 0,
            "flowPath": [
              "rootFlow"
            ]
          },
          "reactions": [
            {
              "flowPath": [
                "rootFlow"
              ],
              "type": "pending request added",
              "details": {
                "eventId": "eventA",
                "bidId": 0,
                "bidType": "request",
                "actionId": 0
              }
            }
          ],
          "tests": [
            /**
             * assert that the request is pending
             */
            (scheduler) => {
                const x = scheduler.getPendingRequests().find(r => r.event == eventA);
                assert(x !== undefined);
            }
        ]
        },
        {
          "action": {
            "id": 1,
            "eventId": "eventA",
            "type": "resolvePendingRequest",
            "flowPath": [
              "rootFlow"
            ],
            "bidId": 0,
            "payload": 1,
            "requestActionId": 0
          },
          "reactions": [
            {
              "flowPath": [
                "rootFlow"
              ],
              "type": "pending request resolved",
              "details": {
                "eventId": "eventA"
              }
            },
            {
              "flowPath": [
                "rootFlow"
              ],
              "type": "flow progressed on a bid",
              "details": {
                "bidId": 0,
                "bidType": "request",
                "eventId": "eventA",
                "actionId": 1
              }
            },
            {
              "flowPath": [
                "rootFlow"
              ],
              "type": "flow ended",
              "details": {}
            }
          ],
          "tests": [
            /**
             * assert that the request is not pending anymore
             */
            (scheduler) => {
                const x = scheduler.getPendingRequests().find(r => r.event == eventA);
                assert(x === undefined);
            }
        ]
        }
      ]);
      assert(fnCalled === 0);
});