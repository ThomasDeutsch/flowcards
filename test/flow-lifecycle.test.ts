import { allDefinedOrDisable, Flow } from "../src/flow";
import { Event } from "../src/event";
import { request, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";
import { delay } from "./test-utils";


describe("a flow execution", () => {

    test('will not automaticall restart after a flow is ended', (done) => {
        const eventA = new Event<number>('eventA');
        let nrBids = 0;
        testSchedulerFactory( function*(this: Flow) {
            this.startFlow('subflow', function* () {
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
            this.startFlow('subflow', function* () {
                yield request(eventA, 1);
            }, []);
            this.endFlows();
            yield [waitFor(eventA), request(eventA, () => delay(500, 2))];
            expect(eventA.value).toBe(2);
            done();
        });
    });

    test('if the string "disable" is passed instead of an array, the flow is disabled.', (done) => {
        const eventA = new Event<number>('eventA');
        let nrBids = 0;
        testSchedulerFactory( function*(this: Flow) {
            const subflow = this.startFlow('subflow', function* () {
                yield request(eventA, 1);
            }, 'disable');
            yield [waitFor(eventA), request(eventA, () => delay(500, 2))];
            expect(eventA.value).toBe(2);
            expect(subflow?.hasEnded).toBe(false);
            expect(subflow?.isDisabled).toBe(true);
            done();
            yield undefined;
        });
    });

    test('if a flow that has a pending request gets disabled, the request is canceled', (done) => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            let test: number | undefined = 1;
            while(true) {
                const subflow = this.startFlow('subflow', function* (_: number) {
                    yield request(eventA, 1);
                    yield request(eventA, () => delay(1000, 2));
                }, allDefinedOrDisable(test));
                this.startFlow('subflow2', function* () {
                    yield waitFor(eventA);
                    yield request(eventA, () => delay(1000, 2));
                }, []);
                if(test === undefined) {
                    expect(subflow?.isDisabled).toBe(true);
                    expect(eventA.isPending).toBe(false);
                    done();
                }
                yield waitFor(eventA);
                test = undefined;
            }
        });
    });

    test('if a flow that has pending extend and gets disabled, the extend is kept', (done) => {
        //TODO
    });

    test('if the string "disable" is passed instead of an array, the flow is ended, using the helper function allDefinedOrDisable', (done) => {
        const eventA = new Event<number>('eventA');
        let nrBids = 0;
        testSchedulerFactory( function*(this: Flow) {
            const subflow = this.startFlow('subflow', function* (number1: number, number2: number, number3: number) {
                yield request(eventA, 1);
            }, allDefinedOrDisable(7, 1, undefined));
            yield [waitFor(eventA), request(eventA, () => delay(500, 2))];
            expect(eventA.value).toBe(2);
            expect(subflow?.hasEnded).toBe(false);
            expect(subflow?.isDisabled).toBe(true);
            done();
        });
    });

    test('a cleanup callback is called as soon as the flow resets or ends', (done) => {
        const eventA = new Event<number>('eventA');
        let isCalledOnReset = false;
        testSchedulerFactory( function*(this: Flow) {
            let i = 0;
            while(i < 2) {
                this.startFlow('subflow', function* (number1: number) {
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