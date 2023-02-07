import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { askFor, block, getEventValue, request, waitFor } from "../src/bid";
import { delay, failedDelay } from "./test-utils";
import { testSchedulerFactory } from "./utils";

describe('a flow can request an event', () => {

    test('a flow can place a request bid. If selected by the scheduler, the flow will progress', () => {
        const eventA = new Event('eventA');
        const myFirstFlow = function*(this: Flow) {
            yield request(eventA, undefined);
            expect(1).toBe(1);
        }
        testSchedulerFactory(myFirstFlow);
    });

    test('a request value can be a function that is called, when the bid is selected', () => {
        const eventA = new Event<number>('eventA');
        let isFunctionCalled = false;
        const myFirstFlow = function*(this: Flow) {
            expect(isFunctionCalled).toBe(false);
            yield request(eventA, () => {
                isFunctionCalled = true;
                return 10;
            });
            expect(isFunctionCalled).toBe(true);
            expect(eventA.value).toBe(10);
        }
        testSchedulerFactory(myFirstFlow);
    });

    test('after a request progressed, the event value is updated', () => {
        const eventA = new Event<number>('eventA');
        const myFirstFlow = function*(this: Flow) {
            yield request(eventA, 101);
            expect(eventA.value).toBe(101);
        }
        testSchedulerFactory(myFirstFlow);
    });

    test('the highest request bid for an event will override the next request bids for the same event. Even when it is invalid, the next request for the same event will not be processed', () => {
        const eventA = new Event<number>('eventA');
        const myFirstFlow = function*(this: Flow) {
            yield [request(eventA, 100, (x) => x > 100), request(eventA, 200)];
        }
        testSchedulerFactory(myFirstFlow);
        expect(eventA.value).toBe(undefined);
    });

    test('a waitFor will progress if the event was requested', () => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            const requestingFlow = this.flow(function* () {
                yield request(eventA, 101);
                expect(eventA.value).toBe(101);
            })
            const waitingFlow = this.flow(function* () {
                yield waitFor(eventA);
                expect(eventA.value).toBe(101);
            });
            yield waitFor(eventA);
            expect(requestingFlow.hasEnded).toBe(true);
            expect(waitingFlow.hasEnded).toBe(true);
            yield undefined;
        });
    });

    test('if the flow is requesting and waiting for an event at the same time, the flow is only progressed once', () => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            const requestingFlow = this.flow(function* () {
                yield [request(eventA, 101), waitFor(eventA)];
                yield waitFor(eventA);
            });
            yield waitFor(eventA);
            expect(requestingFlow.hasEnded).toBe(false);
            yield undefined;
        });
    });

    test('if two flows are requesting the same event at the same time, they will be processed separately', (done) => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            const requestingFlowLower = this.flow(function* () {
                yield request(eventA, 101);
            })
            const requestingFlowHigher = this.flow(function* () {
                yield request(eventA, 202);
            });
            yield waitFor(eventA);
            expect(eventA.value).toBe(202);
            yield waitFor(eventA);
            expect(eventA.value).toBe(101);
            expect(requestingFlowLower.hasEnded).toBe(true);
            expect(requestingFlowHigher.hasEnded).toBe(true);
            done();
            yield undefined;
        });
    });

    test('a request bid can have a validate function', (done) => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            const requestingFlowBlocked = this.flow(function* () {
                yield request(eventA, 1, () => false);
            });
            const requestingFlow = this.flow(function* () {
                yield request(eventA, 2, () => true);
            });
            yield waitFor(eventA);
            expect(requestingFlowBlocked.hasEnded).toBe(false);
            expect(requestingFlow.hasEnded).toBe(true);
            done();
            yield undefined;
        });
    });
});


describe('a flow can request an async event', () => {

    test('if the payload-function returns a promise, the event will be pending until resolved', (done) => {
        const eventA = new Event<number>('eventA');
        function* requestFlow(this: Flow) {
            yield request(eventA, () => delay(100, 1));
            expect(eventA.isPending).toBe(false);
            expect(eventA.value).toBe(1);
            done();
            yield undefined;
        }
        testSchedulerFactory(requestFlow);
        expect(eventA.isPending).toBe(true);
    });

    test("for multiple active promises in one yield, only one resolve will progress the Flow", (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        function* requestFlow(this: Flow) {
            yield [request(eventA, () => delay(100, 1)), request(eventB, () => delay(10, 2))];
            expect(eventA.isPending).toBe(true); // not canceled yet. if the bid is not repeated it will get canceled.
            expect(eventB.isPending).toBe(false);
            expect(eventA.value).toBe(undefined);
            expect(eventB.value).toBe(2);
            done();
            yield undefined;
        }
        testSchedulerFactory(requestFlow);
    });

    test("an async event is canceled, if another bid is progressed and the requesting bid is not repeated", (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        function* requestFlow(this: Flow) {
            yield [request(eventA, () => delay(100, 1)), request(eventB, () => delay(10, 2))];
            expect(eventA.isPending).toBe(true); // not canceled yet. if the bid is not repeated it will get canceled.
            expect(eventB.isPending).toBe(false);
            yield request(eventB, 1);
            expect(eventA.isPending).toBe(false); // event was canceled
            done();
            yield undefined;
        }
        testSchedulerFactory(requestFlow);
    });

    test('an async function that failed the validation on resolve will throw', (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');

        testSchedulerFactory(function*(this: Flow) {
            let hasCatchedError = false;
            const requestingFlow = this.flow(function* () {
                yield request(eventA, () => delay(100, 1), () => true);
            });
            const requestingFlowBlocked = this.flow(function* () {
                try {
                    yield request(eventB, () => failedDelay(20, 2), () => false);
                } catch(e) {
                    hasCatchedError = true;
                }
            });
            yield waitFor(eventA);
            expect(hasCatchedError).toBe(true);
            expect(requestingFlowBlocked.hasEnded).toBe(true);
            expect(requestingFlow.hasEnded).toBe(true);
            done();
            yield undefined;
        });
    });

    test('if a reject is not catched, the flow will be reset', (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');

        testSchedulerFactory(function*(this: Flow) {
            let startCount = 0;
            const requestingFlow = this.flow(function* () {
                yield request(eventA, () => delay(100, 1));
            });
            const requestingFlowBlocked = this.flow(function* () {
                startCount++;
                yield [request(eventB, () => failedDelay(20, 2)), block(eventB, () => startCount !== 1)];
                yield undefined;
            });
            yield waitFor(eventA);
            expect(startCount).toBe(2);
            expect(requestingFlowBlocked.hasEnded).toBe(false);
            expect(requestingFlow.hasEnded).toBe(true);
            done();
            yield undefined;
        });
    });

    test('an invalid validate for the async request will throw an error', (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');

        testSchedulerFactory(function*(this: Flow) {
            let hasCatchedError = false;
            const requestingFlow = this.flow(function* () {
                yield request(eventA, () => delay(100, 1));
            });
            const requestingFlowBlocked = this.flow(function* () {
                try {
                    yield request(eventB, () => delay(20, 2), () => false);
                } catch(e) {
                    hasCatchedError = true;
                }
            });
            yield waitFor(eventA);
            expect(hasCatchedError).toBe(true);
            expect(requestingFlowBlocked.hasEnded).toBe(true);
            expect(requestingFlow.hasEnded).toBe(true);
            done();
            yield undefined;
        });
    });

    test('will be canceled, if the flow resets', (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        let loops = 1;

        testSchedulerFactory(function*(this: Flow) {
            while(loops < 3) {
                this.flow(function* test(eventBValue: number) {
                    const currentLoops = loops;
                    yield request(eventA, () => delay(currentLoops * 1000, currentLoops));
                }, [loops])
                yield request(eventB, () => delay(100, 1))
                loops = loops + 1;
            }
            const test = yield* getEventValue(waitFor(eventA));
            expect(test).toBe(2);
            done();
            yield undefined;
        });
    });

    // test('an error inside the request-function will reset the flow', (done) => {
    //     const eventA = new Event<number>('eventA');
    //     let requestingFlow: Flow | undefined;

    //     testSchedulerFactory(function*(this: Flow) {
    //         requestingFlow = this.flow(function* () {
    //             yield askFor(eventA);
    //             yield request(eventA, () => {
    //                 throw new Error('test');
    //             });
    //         });
    //         yield undefined;
    //     });
    //     eventA.set(1);
    //     expect(requestingFlow?.hasEnded).toBe(false);
    //     done();
    // });
})