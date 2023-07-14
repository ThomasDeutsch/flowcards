import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { askFor, request, waitFor } from "../src/bid";
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

    test('if a flow will be disabled if it is not enabled inside a context', () => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        let subflow: Flow | undefined;
        let nr = 1;
        testSchedulerFactory(function*(this: Flow) {
            while(true) {
                const x = yield* getValue(request(eventA, () => nr++));
                this.context('context', () => {
                    if(x === 1) {
                        subflow = this.flow('subflow', function* () {
                            yield askFor(eventB);
                        }, []);
                    }
                })
                if(x === 2) {
                    yield undefined;
                }
            }
        });
        expect(eventB.isAskedFor).toBe(false);
        expect(subflow?.isDisabled).toBe(true);
    });

    test('a disabled flow can be re-enabled', () => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        let subflow: Flow | undefined;
        let nr = 1;
        let contextCalled = 0;
        let subflowHistory: (boolean | undefined | number)[] = [];
        testSchedulerFactory(function*(this: Flow) {
            while(true) {
                const x = yield* getValue(request(eventA, () => nr++));
                this.context('context', () => {
                    contextCalled++;
                    if(x === 1 || x === 3) {
                        console.log('enabling on x: ', x)
                        subflow = this.flow('subflow', function* () {
                            yield askFor(eventB);
                        }, []);
                    }
                })
                const isDisabled = subflow?.isDisabled;
                subflowHistory.push(isDisabled ? x : isDisabled);
                if(x === 3) {
                    yield undefined;
                }
            }
        });
        expect(contextCalled).toBe(3);
        expect(subflowHistory.length).toBe(3);
        expect(subflowHistory[0]).toBe(false);
        expect(subflowHistory[1]).toBe(2);
        expect(subflowHistory[2]).toBe(false);
        expect(eventB.isAskedFor).toBe(true);
        expect(subflow?.isDisabled).toBe(false);
    });

    test('if a flow that has a pending request gets disabled, the request is canceled', (done) => {
        //TODO
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