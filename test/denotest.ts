import { Event } from "../src/event.ts";
import { runFlowcardsTests } from "./utils.ts";
import { Flow } from "../src/flow.ts";
import { askFor, request } from "../src/bid.ts";
import { delay } from "./test-utils.ts";


Deno.test("askForTest", async (t) => {
    const eventA = new Event<number>('eventA');
    await runFlowcardsTests(t, function*(this: Flow) {
        yield askFor(eventA);
    }, {eventA},[
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
          "type": "external",
          "eventId": "eventA",
          "payload": 123,
          "bidId": 0,
          "flowId": "rootFlow"
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
          },
          {
            "flowPath": [
              "rootFlow"
            ],
            "type": "flow ended",
            "details": {}
          }
        ]
      }
    ]
    );
});


Deno.test("asyncRequestTest", async (t) => {
  const eventA = new Event<number>('eventA');
      await runFlowcardsTests(t, function*(this: Flow) {
          yield request(eventA, () => delay(100, 1));
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
            "payload": "__%TAKE_PAYLOAD_FROM_BID%__",
            "bidId": 0,
            "flowId": "rootFlow"
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
          ]
        }
      ]);
});