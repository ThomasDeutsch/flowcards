import { Flow, askFor, Event, trigger, waitFor } from "../src";
import { testSchedulerFactory } from "./utils";

describe("a sub flow can be added/removed dynamically", () => {

    test('a flow can be added by .flow() from the outside', () => {
        const eventA = new Event<number>('eventA');
        const engine = testSchedulerFactory(function*(this: Flow) {
            yield askFor(eventA);
        });
        // add a flow from outside:
        engine.rootFlow.flow('addDynamically', function*() {
            yield trigger(eventA, 123);
        }, []);
        expect(eventA.value).toBe(123);
    });

    test('a flow can be removed by .end() from the outside', () => {
        const eventA = new Event<number>('eventA');
        const engine = testSchedulerFactory(function*(this: Flow) {
            this.flow('subflow', function*() {
                yield waitFor(eventA);
            }, []);
            yield askFor(eventA);
        });
        // add a flow from outside:
        //TODO: expect(engine.rootFlow.subFlows.length).toBe(0);
        expect(1).toBe(0);
    });
});