import { Event } from "../src/event.ts";
import { runFlowcardsTests } from "./utils.ts";
import { Flow } from "../src/flow.ts";
import { askFor, request } from "../src/bid.ts";
import { delay } from "./test-utils.ts";


Deno.test("askForTest", async (t) => {
    const eventA = new Event<number>('eventA');
    await runFlowcardsTests(t, function*(this: Flow) {
        yield askFor(eventA);
    }, {eventA},
    );
});


Deno.test("asyncRequestTest", async (t) => {
  const eventA = new Event<number>('eventA');
      await runFlowcardsTests(t, function*(this: Flow) {
          yield request(eventA, () => delay(100, 1));
      }, {eventA}, []);
});