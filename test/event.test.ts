import { Flow } from "../src/flow";
import { Event, EventByKey } from "../src/event";
import { askFor, block, request, validate, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";
import { delay } from "./test-utils";


describe("events will be updated", () => {

    test('if an askFor bid is placed', () => {
        let eventUpdateCount = 0;
        const loggerFn = () => {
            eventUpdateCount++;
        }
        const eventA = new Event<number>('eventA', loggerFn);
        eventA.setDescription("event to test the event update feature");

        const myFirstFlow = function*(this: Flow) {
            yield askFor(eventA);
            yield waitFor(eventA);
        }
        testSchedulerFactory(myFirstFlow);
        expect(eventUpdateCount).toBe(1);
    });

    test('if the value gets updated', () => {
        let eventUpdateCount = 0;
        const loggerFn = () => {
            eventUpdateCount++;
        }
        const eventA = new Event<number>('eventA', loggerFn);
        eventA.setDescription("event to test the event update feature");

        const mainFlow = function*(this: Flow) {
            yield request(eventA, 1);
        }
        testSchedulerFactory(mainFlow);
        expect(eventUpdateCount).toBe(1);
    });

    test('when it gets blocked', () => {
        let eventUpdateCount = 0;
        const loggerFn = () => {
            eventUpdateCount++;
        }
        const eventA = new Event<number>('eventA', loggerFn);
        eventA.setDescription("event to test the event update feature");

        const mainFlow = function*(this: Flow) {
            this.flow('subflow', function*() {
                yield block(eventA);
            }, []);
        }
        testSchedulerFactory(mainFlow);
        expect(eventUpdateCount).toBe(1);
    });

    test('not when a waitFor bid is placed', () => {
        let eventUpdateCount = 0;
        const loggerFn = () => {
            eventUpdateCount++;
        }
        const eventA = new Event<number>('eventA', loggerFn);

        const mainFlow = function*(this: Flow) {
            yield waitFor(eventA);
        }
        testSchedulerFactory(mainFlow);
        expect(eventUpdateCount).toBe(0);
    });

    test('when a validate bid is placed, even without an askFor', () => {
        let eventUpdateCount = 0;
        const loggerFn = () => {
            eventUpdateCount++;
        }
        const eventA = new Event<number>('eventA', loggerFn);

        const mainFlow = function*(this: Flow) {
            yield validate(eventA, () => false);
        }
        testSchedulerFactory(mainFlow);
        expect(eventUpdateCount).toBe(1);
    });
});


describe('events can have', () => {

    test('a union type, where the event itself can be undefined.', () => {
        const eventA = new Event<number | undefined>('eventA');
        const myFirstFlow = function*(this: Flow) {
            yield [request(eventA, 100)];
        }
        testSchedulerFactory(myFirstFlow);
        expect(eventA.value).toBe(100);
    });

    test('no type-definition. The default type will be set to undefined', () => {
        const eventA = new Event('eventA');
        const myFirstFlow = function*(this: Flow) {
            yield [request(eventA, undefined)];
        }
        testSchedulerFactory(myFirstFlow);
        expect(eventA.value).toBe(undefined);
    });

})


describe('events can be dependent on other events, if they are accessed in a validation function', () => {

    test('when a value is accessed, the event will update if the accessed event is updated.', (done) => {
        let eventUpdateCount = 0;
        let requestFlow: Flow;
        const loggerFn = () => {
            eventUpdateCount++;
        }
        const eventA = new Event<number | undefined>('eventA', loggerFn);
        const eventB = new Event<number>('eventB');

        const myFirstFlow = function*(this: Flow) {
            this.flow('subflow', function*(this: Flow) {
                yield askFor(eventA, () => Boolean(eventB.value && eventB.value > 10));
            }, [])
            requestFlow = this.flow('subflow2', function* () {
                yield request(eventB, () => delay(100, 100));
            }, []);
            yield undefined;
        }
        // even if event a is not changed, it will be updated, because its validation is dependent on eventB
        testSchedulerFactory(myFirstFlow, () => {
            if(requestFlow.hasEnded) {
                expect(eventB.value).toBe(100);
                expect(eventA.value).toBe(undefined);
                expect(eventUpdateCount).toBe(2);
                expect(eventA.isValid(10)).toBe(true);
                done();
            }
        });
        // a validation needs to be called, in order to capture the dependency to eventB
        expect(eventA.isValid(10)).toBe(false);
    });

    test('when the validation function is not checked, the eventB dependency is not present', (done) => {
        let eventUpdateCount = 0;
        let requestFlow: Flow;
        const loggerFn = () => {
            eventUpdateCount++;
        }
        const eventA = new Event<number | undefined>('eventA', loggerFn);
        const eventB = new Event<number>('eventB');

        const myFirstFlow = function*(this: Flow) {
            this.flow('subflow', function*(this: Flow) {
                yield askFor(eventA, () => Boolean(eventB.value && eventB.value > 10));
            }, [])
            requestFlow = this.flow('subflow2', function* () {
                yield request(eventB, () => delay(100, 100));
            }, []);
            yield undefined;
        }
        testSchedulerFactory(myFirstFlow, () => {
            if(requestFlow.hasEnded) {
                expect(eventB.value).toBe(100);
                expect(eventA.value).toBe(undefined);
                expect(eventUpdateCount).toBe(1); // only updated once (aksFor bid is placed)
                expect(eventA.isValid(10)).toBe(true);
                done();
            }
        });
        // no validation is called, so the dependency is not registered
        // expect(eventA.isValid(10)).toBe(false);
    });

    test('when a status like isPending is accessed, the event will update if the accessed event is updated.', (done) => {
        let eventUpdateCount = 0;
        let requestFlow: Flow;
        const loggerFn = () => {
            eventUpdateCount++;
        }
        const eventA = new Event<number | undefined>('eventA', loggerFn);
        const eventB = new Event<number>('eventB');

        const myFirstFlow = function*(this: Flow) {
            this.flow('subflow', function*(this: Flow) {
                yield askFor(eventA, () => !eventB.isPending);
            }, [])
            requestFlow = this.flow('subflow2', function* () {
                yield request(eventB, () => delay(100, 100));
            }, []);
            yield undefined;
        }
        // even if event a is not changed, it will be updated, because its validation is dependent on eventB
        testSchedulerFactory(myFirstFlow, () => {
            if(requestFlow.hasEnded) {
                expect(eventB.value).toBe(100);
                expect(eventA.value).toBe(undefined);
                expect(eventUpdateCount).toBe(2);
                expect(eventA.isValid(100)).toBe(true);
                done();
            }
        });
        // a validation needs to be called, in order to capture the dependency to eventB
        expect(eventA.isValid(100)).toBe(false);
    });
})