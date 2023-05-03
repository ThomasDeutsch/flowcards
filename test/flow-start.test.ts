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
            const requestingFlow = this.flow('subflow', function* (this: Flow) {
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
            this.flow('subflow', function* child1(this: Flow) {
                this.flow('subflow2', function* child2(this: Flow) {
                    expect(this.id).toBe(`${rootFlow.id}>subflow>subflow2`)
                    yield undefined;
                }, []);
                expect(this.id).toBe(`${rootFlow.id}>subflow`)
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
            this.flow('subflow', function* (this: Flow) {
                // second child
                this.flow('subflow2', function* (this: Flow) {
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
            this.flow('subflow', function* (this: Flow, test: number, test2: string) {
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
            this.flow('subflow', function* (this: Flow, test: number, test2: string) {
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
                this.flow('subflow', function* (this: Flow, test: number) {
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
                this.flow('subflow', generatorTest, [count]);
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
});