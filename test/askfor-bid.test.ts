import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { askFor, extend, request, trigger, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";


describe("the askFor bid behavior", () => {

    test('when an askFor bid is placed, the event is dispatch-able', () => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            yield askFor(eventA);
        });
        expect(eventA.explainSetter).toBe('enabled');
    });

    test('can be triggered', () => {
        let askForFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        testSchedulerFactory( function*(this: Flow) {
            while(true) {
                yield askFor(eventA);
                askForFlow = this.startFlow('subflow', function* () {
                    yield askFor(eventA);
                }, []);
                this.startFlow('subflow2', function* () {
                    yield trigger(eventA, 123);
                    yield request(eventB, 199);
                }, []);
            }
        });
        eventA.set(12);
        waitFor(eventA);
        waitFor(eventA);
        expect(askForFlow!?.hasEnded).toBe(true);
        expect(eventA.value).toBe(123);
        expect(eventB.value).toBe(199);
    });

    test('can be triggered - event type is undefined', () => {
        let askForFlow: Flow | undefined;
        const eventA = new Event('eventA');
        testSchedulerFactory( function*(this: Flow) {
            while(true) {
                askForFlow = this.startFlow('subflow', function* () {
                    yield askFor(eventA);
                }, [])
                this.startFlow('subflow2', function* () {
                    yield trigger(eventA, undefined);
                }, []);
                yield undefined;
            }
        });

        waitFor(eventA);
        expect(askForFlow!?.hasEnded).toBe(true);
        expect(eventA.value).toBe(undefined);
    });

    test('a trigger will not process unless there is a matching askFor', () => {
        let askForFlow: Flow | undefined;
        let waitForFlow: Flow | undefined;
        let triggerFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.startFlow('subflow', function* () {
                yield askFor(eventA, (x) => x > 123);
            }, [])
            waitForFlow = this.startFlow('subflow2', function* () {
                yield waitFor(eventA);
            }, [])
            triggerFlow = this.startFlow('subflow3', function* () {
                yield trigger(eventA, 123);
            }, []);
            yield undefined;

        });
        expect(triggerFlow!?.hasEnded).toBe(false);
        expect(askForFlow!?.hasEnded).toBe(false);
        expect(askForFlow!?.hasEnded).toBe(false);
    });

    test('can be dispatched', (done) => {
        let askForFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.startFlow('subflow', function* () {
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
            askForFlow = this.startFlow('subflow', function* () {
                yield askFor(eventA);
            }, []);
            this.startFlow('subflow2', function*() {
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
            askForFlow = this.startFlow('subflow2', function* () {
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
            askForFlow = this.startFlow('subflow', function* () {
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
            askForFlow = this.startFlow('subflow', function* () {
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