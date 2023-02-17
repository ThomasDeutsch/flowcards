import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { block, request, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";


describe("how bids can be placed with a yield statement", () => {

    test('a single bid can be placed', () => {
        const eventA = new Event<number>('eventA');
        const myFirstFlow = function*(this: Flow) {
            yield request(eventA, 1);
        }
        testSchedulerFactory(myFirstFlow);
        expect(eventA.value).toBe(1);
    });

    test('an undefined bid is allowed, but will pause the flow indefinitely', () => {
        const eventA = new Event<number>('eventA');
        const myFirstFlow = function*(this: Flow) {
            yield undefined;
            yield request(eventA, 10);
        }
        testSchedulerFactory(myFirstFlow);
        expect(eventA.value).not.toBe(10);
    });

    test('multiple bids can be placed at the same time. The first bid has the highest priority', () => {
        const eventA = new Event<number>('eventA');
        const myFirstFlow = function*(this: Flow) {
            yield [request(eventA, 100), request(eventA, 200), request(eventA, 300)];
        }
        testSchedulerFactory(myFirstFlow);
        expect(eventA.value).toBe(100);
    });

    test('if the highest priority bid is blocked, the next bid is processed (for another event)', () => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        const myFirstFlow = function*(this: Flow) {
            yield [request(eventA, 100), block(eventA), request(eventB, 200)];
        }
        testSchedulerFactory(myFirstFlow);
        expect(eventB.value).toBe(200);
    });

    test('a bid will return a progress information', () => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<undefined>('eventB');
        testSchedulerFactory(function*(this: Flow) {
            const requestingFlow = this.flow(function* (this: Flow) {
                const [event, remainingBids] = yield [request(eventA, 101), request(eventB, undefined)];
                expect(event).toBe(eventA);
                expect(remainingBids?.length).toEqual(1);
                expect(remainingBids?.[0].event).toBe(eventB);
                expect(remainingBids?.[0].id).toBe(1);
                expect(remainingBids?.[0].flow).toBe(requestingFlow);
                expect(remainingBids?.[0].type).toBe('request');
                expect(remainingBids?.[0].validate).toBeUndefined();
                
            }, []);
            const [event, remainingBids] = yield waitFor(eventA);
            expect(event).toBe(eventA);
            expect(remainingBids).toBeUndefined();
            expect(requestingFlow.hasEnded).toBe(true);
            yield undefined;
        });
    });
});