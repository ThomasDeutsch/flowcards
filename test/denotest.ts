import { Event } from "../src/event.ts";
import { runFlowcardsTests } from "./utils.ts";
import { Flow } from "../src/flow.ts";
import { askFor, request } from "../src/bid.ts";
import { delay } from "./test-utils.ts";


Deno.test("askForTest", async (t) => {
    const eventA = new Event<number>('eventA');
        await runFlowcardsTests(t, function*(this: Flow) {
            yield askFor(eventA);
            yield undefined;
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
            effect: () => {
                eventA.trigger(123);
            }
          },
          {
            "action": {
              "type": "external",
              "payload": 123,
              "id": 0,
              "eventId": "eventA",
              "flowId": "rootFlow",
              "bidId": 0
            },
            "reactions": [
              {
                "flowPath": [
                  "rootFlow"
                ],
                "type": "flow progressed on a bid",
                "details": {
                  "bidId": 0,
                  "bidType": "askFor",
                  "eventId": "eventA",
                  "actionId": 0
                }
              }
            ]
          }
        ]);
});


Deno.test("asyncRequestTest", async (t) => {
  const eventA = new Event<number>('eventA');
      await runFlowcardsTests(t, function*(this: Flow) {
          yield request(eventA, () => delay(100, 1));
          yield undefined;
      }, {eventA}, []);
});