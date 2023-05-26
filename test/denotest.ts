import { assert, assertEquals } from "https://deno.land/std@0.189.0/testing/asserts.ts";
import { Event } from "../src/event.ts";
import { testSchedulerFactory } from "./utils.ts";
import { Flow } from "../src/flow.ts";
import { askFor } from "../src/bid.ts";


Deno.test("url test", () => {
    const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            yield askFor(eventA);
        }, {eventA}, [{
            reactions: [
              {
                flowPath: [
                  "test"
                ],
                type: "flow enabled",
                details: {}
              }
            ]
          },{
            effect: () => {
                console.log('eventA, is valid:', eventA.isValid(123));
                eventA.trigger(123);
            },
        },
        {
            action: {
                type: 'external',
                payload: 123,
                id: 0,
                eventId: 'eventA',
                flowId: 'test',
                bidId: 0
            },
            reactions: [
                {
                    flowPath: [ 'test' ],
                    type: 'flow progressed on a bid',
                    details: { bidId: 0, bidType: 'askFor', eventId: 'eventA', actionId: 0 }
                },
                { flowPath: [ 'test' ], type: 'flow ended', details: {} }
            ], effect: () => {
                assertEquals(1, 2);
            }
        },
        ]);
});