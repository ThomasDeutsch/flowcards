import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { request, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";
import { delay } from "./test-utils";
import { getValue } from "../src";


describe("a flow execution", () => {

    test('will not automaticall restart after a flow is ended', (done) => {
        const eventA = new Event<number>('eventA');
        let nrBids = 0;
        testSchedulerFactory( function*(this: Flow) {
            this.flow('subflow', function* () {
                nrBids++;
                yield request(eventA, 1);
            }, []);
            yield waitFor(eventA);
            expect(eventA.value).toBe(1);
            yield [waitFor(eventA), request(eventA, () => delay(100, 2))];
            expect(nrBids).toBe(1);
            expect(eventA.value).toBe(2);
            done();
        });
    });

    test('.endFlows() will end all child-flows', (done) => {
        const eventA = new Event<number>('eventA');
        let nrBids = 0;
        testSchedulerFactory( function*(this: Flow) {
            this.flow('subflow', function* () {
                yield request(eventA, 1);
            }, []);
            this.endFlows();
            yield [waitFor(eventA), request(eventA, () => delay(500, 2))];
            expect(eventA.value).toBe(2);
            done();
        });
    });

    test('if a child flow is not enabled after a getValue or getValues bid, then it will get disabled', () => {
        const eventA = new Event<number>('eventA');
        let subflow: Flow | undefined;
        let subflow2: Flow | undefined;
        testSchedulerFactory(function*(this: Flow) {
            while(true) {
                const x = yield* getValue(request(eventA, 1));
                subflow = this.flow('subflow', function* () {
                    yield undefined;
                }, []);
                subflow2 = this.flow('subflow2', function* () {
                    yield undefined;
                }, []);
                const y = yield* getValue(request(eventA, 2));
                this.flow('subflow2', function* () {
                    yield undefined;
                }, []);
                yield request(eventA, 3);
                yield undefined;
            }
        });
        expect(subflow?.isDisabled).toBe(true);
        expect(subflow2?.isDisabled).toBe(false);
    });

    test('if a flow that has a pending request gets disabled, the request is canceled', (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');

        testSchedulerFactory(function*(this: Flow) {
            let test: number | undefined = 1;
            let subflow: Flow | undefined;
            while(true) {
                subflow = this.flow('subflow', function* () {
                    yield request(eventA, () => delay(1000, 2));
                }, []);
                yield* getValue(request(eventB, 1));
                yield request(eventB, 3);
                expect(subflow?.isDisabled).toBe(true);
                expect(eventA.isPending).toBe(false);
                done();
                yield undefined;
            }
        });
    });

    test('if a flow that has pending extend and gets disabled, the extend is kept', (done) => {
        //TODO
    });

    test('a disabled flow will not place any bids', (done) => {
        //TODO
    });

    test('a cleanup callback is called as soon as the flow resets or ends', (done) => {
        const eventA = new Event<number>('eventA');
        let isCalledOnReset = false;
        testSchedulerFactory( function*(this: Flow) {
            let i = 0;
            while(i < 2) {
                this.flow('subflow', function* (number1: number) {
                    yield request(eventA, i);
                    this.cleanup(() => {
                        isCalledOnReset = true;
                    });
                }, [i]);
                i++;
                yield waitFor(eventA);
            }
            expect(eventA.value).toBe(1);
            expect(isCalledOnReset).toBe(true);
            done();
        });
    });
});