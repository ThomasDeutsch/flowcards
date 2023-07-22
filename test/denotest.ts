import { Event } from "../src/event.ts";
import { runFlowcardsTests } from "./utils.ts";
import { Flow } from "../src/flow.ts";
import { askFor, request } from "../src/bid.ts";
import { delay } from "./test-utils.ts";
import { assert } from "https://deno.land/std@0.190.0/_util/asserts.ts";


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
          ]
        }
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
          } );
      }, {eventA});
      assert(fnCalled === 0);
});