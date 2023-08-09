import { Event } from "../src/event.ts";
import { runFlowcardsTests } from "./utils.ts";
import { Flow } from "../src/flow.ts";
import { askFor, request, trigger } from "../src/bid.ts";
import { assert } from "https://deno.land/std@0.190.0/_util/asserts.ts";

Deno.test("a askFor will not progress on a request", async (t) => {
    const eventA = new Event<number>('eventA');
    await runFlowcardsTests(t, function*(this: Flow) {
        this.flow('subflow', function*(this: Flow) {
            yield askFor(eventA);
        }, []);
        yield request(eventA, 1);
    }, {eventA}, []
    )
});

Deno.test("a askFor will only progress on a trigger", async (t) => {
    const eventA = new Event<number>('eventA');
    await runFlowcardsTests(t, function*(this: Flow) {
        this.flow('subflow', function*(this: Flow) {
            yield askFor(eventA);
        }, []);
        yield trigger(eventA, 1);
        yield undefined;
    }, {eventA}, []
    )
});