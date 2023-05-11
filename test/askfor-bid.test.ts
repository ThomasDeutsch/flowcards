import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { askFor, extend, requestIfAskedFor, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";


describe("the askFor bid behavior", () => {

    test('when an askFor bid is placed, the event is dispatch-able', () => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            yield askFor(eventA);
        });
        expect(eventA.explainSetter).toBe('enabled');
    });

    test('can be requested, only if there is an ask for', () => {
        let askForFlow: Flow | undefined;
        let requestFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.flow('subflow', function* () {
                yield askFor(eventA);
            }, []);
            requestFlow = this.flow('subflow2', function* () {
                yield requestIfAskedFor(eventA, 123);
            }, []);
            yield undefined;
        });
        expect(askForFlow?.hasEnded).toBe(true);
        expect(requestFlow?.hasEnded).toBe(true);
        expect(eventA.value).toBe(123);

    });

    test('can be requested if asked for - event type is undefined', () => {
        let askForFlow: Flow | undefined;
        const eventA = new Event('eventA');
        testSchedulerFactory( function*(this: Flow) {
            while(true) {
                askForFlow = this.flow('subflow', function* () {
                    yield askFor(eventA);
                }, [])
                this.flow('subflow2', function* () {
                    yield requestIfAskedFor(eventA, undefined);
                }, []);
                yield undefined;
            }
        });
        expect(askForFlow!?.hasEnded).toBe(true);
        expect(eventA.value).toBe(undefined);
    });

    test('a requestIfAskedFor will not process unless there is a matching askFor', () => {
        let askForFlow: Flow | undefined;
        let waitForFlow: Flow | undefined;
        let requestFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.flow('subflow', function* () {
                yield askFor(eventA, (x) => x > 123);
            }, [])
            waitForFlow = this.flow('subflow2', function* () {
                yield waitFor(eventA);
            }, [])
            requestFlow = this.flow('subflow3', function* () {
                yield requestIfAskedFor(eventA, 123);
            }, []);
            yield undefined;

        });
        expect(requestFlow!?.hasEnded).toBe(false);
        expect(askForFlow!?.hasEnded).toBe(false);
        expect(askForFlow!?.hasEnded).toBe(false);
    });

    test('can be dispatched', (done) => {
        let askForFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.flow('subflow', function* () {
                yield askFor(eventA);
            }, []);
            yield undefined;
        });
        eventA.set(10);
        expect(eventA.value).toBe(10);
        done();
    });

    test('can be extended', (done) => {
        let askForFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.flow('subflow', function* () {
                yield askFor(eventA);
            }, []);
            this.flow('subflow2', function*() {
                yield extend(eventA);
            }, [])
            yield undefined;
        });
        eventA.set(10)
        expect(eventA.value).toBe(undefined);
        expect(eventA.isPending).toBe(true);
        done();
    });

    test('can be tested for valid payload', () => {
        let askForFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.flow('subflow2', function* () {
                yield askFor(eventA, (x) => x > 10);
            }, []);
            yield undefined;
        });
        expect(eventA.isValid(1)).toBe(false);
        expect(eventA.isValid(11)).toBe(true);
        expect(eventA.validate(10).results.length).toBe(0);
    })

    test('can be tested for valid payload (custom validation type)', () => {
        let askForFlow: Flow | undefined;
        const eventA = new Event<number, string>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.flow('subflow', function* () {
                yield askFor(eventA, (x) => ({isValid: true, details: ['abc']}));
            }, []);
            yield undefined;
        });
        expect(eventA.isValid(11)).toBe(true);
        expect(eventA.validate(10).results.length).toBe(1);
        expect(eventA.validate(10).results[0].details[0]).toBe('abc');
    })

    test('will not allow an invalid value to be set', () => {
        let askForFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.flow('subflow', function* () {
                yield askFor(eventA, (x) => x < 10);
            }, []);
            yield undefined;
        });
        expect(eventA.isValid(10)).toBe(false);
        expect(eventA.isValid(9)).toBe(true);
        expect(eventA.value).toBe(undefined);
        expect(eventA.set(10)).toThrow(Error);
    })
});