import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { request, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";
import { getAllValues, getFirstValue, getValue } from "../src";


describe("different flow utility functions", () => {

    test("the getAllValues utility function will progress the flow if all (progressable) bids have progressed", (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        testSchedulerFactory( function*(this: Flow) {
            const [a, b] = yield* getAllValues(request(eventA, 1), request(eventB, 2));
            expect(eventA.value).toBe(1);
            expect(eventB.value).toBe(2);
            expect(a).toBe(1);
            expect(b).toBe(2);
            done();
            yield undefined;
        });
    });

    test("the getValue utility function will return the current value of the event, at the time the flow progresses", (done) => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            const a = yield* getValue(request(eventA, 1));
            expect(eventA.value).toBe(1);
            expect(a).toBe(1);
            done();
            yield undefined;
        });
    });

    test("the getFirstValue utility function will return on any new progressed bid", (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<string>('eventB');
        testSchedulerFactory( function*(this: Flow) {
            const testFlow = this.flow('subflow', function*() {
                yield request(eventA, 1);
                yield request(eventB, 'b');
            }, []);
            let [a, b] = yield* getFirstValue(waitFor(eventA), waitFor(eventB));
            expect(eventA.value).toBe(1);
            expect(eventB.value).toBe(undefined);
            this.keepEnabled('subflow');
            [a, b] = yield* getFirstValue(waitFor(eventA), waitFor(eventB));
            expect(eventA.value).toBe(1);
            expect(eventB.value).toBe('b');
            done();
            yield undefined;
        });
    });
})

