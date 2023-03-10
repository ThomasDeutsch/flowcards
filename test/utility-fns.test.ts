import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { request, waitFor, getEventValues, getAllValues } from "../src/bid";
import { testSchedulerFactory } from "./utils";


describe("different flow utility functions", () => {

    test("the getAllValues utility function will progress the flow if all bids have progressed", (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        testSchedulerFactory( function*(this: Flow) {
            yield* getAllValues(request(eventA, 1), request(eventB, 2));
            expect(eventA.value).toBe(1);
            expect(eventB.value).toBe(2);
            done();
            yield undefined;
        });
    });

    test("the getEventValues utility function will return on any new passed bid", (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<string>('eventB');
        testSchedulerFactory( function*(this: Flow) {
            this.flow('subflow', function*() {
                yield request(eventA, 1);
                yield request(eventB, 'b');
            }, [], true);
            let [a, b] = yield* getEventValues(waitFor(eventA), waitFor(eventB));
            expect(eventA.value).toBe(1);
            expect(eventB.value).toBe(undefined);
            [a, b] = yield* getEventValues(waitFor(eventA), waitFor(eventB));
            expect(eventA.value).toBe(1);
            expect(eventB.value).toBe('b');
            done();
            yield undefined;
        });
    });
})

