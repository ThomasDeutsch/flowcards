import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { askFor, request, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";
import { delay } from "./test-utils";


describe("a sub-flow can be started", () => {

    test('if a sub-flow is started, "this" will be the child flow', () => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const rootFlow = this;
            const requestingFlow = this.startFlow('subflow', function* (this: Flow) {
                yield waitFor(eventA);
                expect(this).toBe(requestingFlow);
            }, [])
            yield request(eventA, 1);
            expect(requestingFlow?.hasEnded).toBe(false); // the request is progressed before the waitFor is progressed
            expect(requestingFlow).not.toBe(rootFlow);
            yield undefined;
        });
    });

    test('a child flow name will inherit its parent name suffixed by >', () => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const rootFlow = this;
            this.startFlow('subflow', function* child1(this: Flow) {
                this.startFlow('subflow2', function* child2(this: Flow) {
                    expect(this.name).toBe(`${rootFlow.name}>subflow>subflow2`)
                    yield undefined;
                }, []);
                expect(this.name).toBe(`${rootFlow.name}>subflow`)
                yield undefined;
            }, [])
            yield undefined;
        });
    });

    test('a subflow will progress before its parents (if both are waiting for an event)', (done) => {
        const eventA = new Event<number>('eventA');
        const progressionOrder: string[] = [];
        testSchedulerFactory( function*(this: Flow) {
            // first child
            this.startFlow('subflow', function* (this: Flow) {
                // second child
                this.startFlow('subflow2', function* (this: Flow) {
                    yield waitFor(eventA);
                    progressionOrder.push('child2')
                }, []);
                yield waitFor(eventA);
                progressionOrder.push('child1')
            }, [])
            yield request(eventA, 1);
            // after this request, the children have not yet progressed
            yield request(eventA, 2);
            expect(progressionOrder[0]).toBe('child2');
            expect(progressionOrder[1]).toBe('child1');
            done();
            yield undefined;
        });
    });

    test('flow parameters can be assigned by an additional array', (done) => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            this.startFlow('subflow', function* (this: Flow, test: number, test2: string) {
                expect(test).toBe(1);
                expect(test2).toBe('test');
                yield waitFor(eventA);
            }, [1, 'test']);
            yield request(eventA, 1);
            done();
            yield undefined;
        });
    });


    test('a flow can be restarted, even if the parameters are not provided', (done) => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            this.startFlow('subflow', function* (this: Flow, test: number, test2: string) {
                expect(test).toBe(1);
                expect(test2).toBe('test');
                yield waitFor(eventA);
            }, [1, 'test']);
            yield request(eventA, 1);
            done();
            yield undefined;
        });
    });

    test('a flow will reset, if any of the parameters change (Object.is check failed)', (done) => {
        const eventA = new Event<number>('eventA');
        let count = 0;
        let started = 0;
        testSchedulerFactory( function*(this: Flow) {
            while(true) {
                count++;
                this.startFlow('subflow', function* (this: Flow, test: number) {
                    started++;
                    expect(test).toBe(count);
                    yield waitFor(eventA);
                }, [count]);
                if(count < 2) {
                    yield request(eventA, 1);
                } else {
                    expect(count).toBe(2);
                    expect(started).toBe(2);
                    done();
                    yield undefined;
                }
            }
        });
    });

    test('the parameters array will allow functions to be defined somewhere else', (done) => {
        let count = 0;
        const generatorTest = function* (this: Flow, test: number) { // the parameter test can be seen as a constant.
            started++;
            expect(test).toBe(count);
            yield waitFor(eventA);
        }
        const eventA = new Event<number>('eventA');
        let started = 0;
        testSchedulerFactory( function*(this: Flow) {
            while(true) {
                count++;
                this.startFlow('subflow', generatorTest, [count]);
                if(count < 2) {
                    yield request(eventA, 1);
                } else {
                    expect(count).toBe(2);
                    expect(started).toBe(2);
                    done();
                    yield undefined;
                }
            }
        });
    });

    test('a subflow can be started after an askFor', (done) => {
        const eventA = new Event<number>('eventA');
        let subFlowStarted = false;
        let created = 0;
        testSchedulerFactory( function*(this: Flow) {
            while(true) {
                yield askFor(eventA);
                this.startFlow('subflow', function* (this: Flow) {
                    subFlowStarted = true;
                    yield request(eventA, 1);
                }, []);
            }
        });
        eventA.set(100);
        expect(subFlowStarted).toBe(true);
        expect(eventA.value).toBe(1);
        done();
    });

    test('a subflow is ended, when the parent progresses on a next bid, and the flow is not activated again.', (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        let subFlowEnded = false;
        testSchedulerFactory( function*(this: Flow) {
            yield request(eventA, 1);
            this.startFlow('subflow', function* (this: Flow) {
                yield request(eventB, () => delay(500, 1));
                subFlowEnded = true;
            }, []);
            yield request(eventA, 2);
            yield request(eventA, () => delay(1000, 3));
            expect(eventB.value).toBe(undefined);
            expect(subFlowEnded).toBe(false);
            done();
        });
    });
});