import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { askFor, request, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";
import { extendAll, getAllValues, getFirstValue, getValue } from "../src";


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

    test("extend all values that are asked for", (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        testSchedulerFactory( function*(this: Flow) {
            const extendingFlow = this.flow('extendingFlow', function*() {
                const [extendedEvent] = yield* extendAll([eventA, eventB], (event) => event.isAskedFor);
                expect(extendedEvent).toBe(eventA);
                done();
            }, []);
            this.flow('requestingFlow', function*() {
                yield request(eventB, 100);
                yield request(eventA, 200)
            }, []);
            this.flow('askingFlow', function*() {
                yield askFor(eventA);
            }, []);
            yield undefined;
        });
    });
})

