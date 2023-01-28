import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { request, validate, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";

describe("behavior of a validate bid", () => {

    test('a validate bid can validate any event ( event is blocked if validate will return false )', () => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        testSchedulerFactory(function* rootFlow(this: Flow) {
            this.flow(function*(this: Flow) {
                yield [request(eventA, 100), validate(eventA, () => false)];
            });
            yield waitFor(eventA);
        });
        expect(eventA.value).toBe(undefined);
    });

    test('a validate bid can validate any event ( event is enabled if validate will return true )', () => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        testSchedulerFactory(function* rootFlow(this: Flow) {
            this.flow(function*(this: Flow) {
                yield [request(eventA, 100), validate(eventA, () => true)];
            });
            yield waitFor(eventA);
        });
        expect(eventA.value).toBe(100);
    });

    test('a validate return type can be specified in the event ( must satisfy the BaseValidation type )', () => {
        const eventA = new Event<number, string>('eventA');
        const eventB = new Event<number>('eventB');
        testSchedulerFactory(function* rootFlow(this: Flow) {
            this.flow(function*(this: Flow) {
                yield [
                    request(eventA, 100),
                    validate(eventA, () => ({isValid: true, details: ["mystring"]}))
                ];
            });
            yield waitFor(eventA);
        });
        expect(eventA.value).toBe(100);
    });

    test('a wait will not progress if the validation fails', () => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        testSchedulerFactory(function* rootFlow(this: Flow) {
            this.flow(function*(this: Flow) {
                yield request(eventA, 100);
            });
            const failedWait = this.flow(function*(this: Flow) {
                yield waitFor(eventA, (x) => x > 100);
            });
            const passedWait = this.flow(function*(this: Flow) {
                yield waitFor(eventA, (x) => x === 100);
            });
            yield waitFor(eventA);
            expect(failedWait.hasEnded).toBe(false);
            expect(passedWait.hasEnded).toBe(true);
        });
        expect(eventA.value).toBe(100);
    });

    test('a validate bid will add a validation to all bids for the type', () => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        testSchedulerFactory(function* rootFlow(this: Flow) {
                this.flow(function*(this: Flow) {
                    yield request(eventA, 100);
                });
                const failedWait = this.flow(function*(this: Flow) {
                    yield waitFor(eventA, (x) => x > 100);
                });
                const passedWait = this.flow(function*(this: Flow) {
                    yield waitFor(eventA, (x) => x === 100);
                });
                this.flow(function*(this: Flow) {
                    yield [request(eventB, 10), validate(eventA, (x) => x < 100)];
                });
                yield waitFor(eventB);
                expect(failedWait.hasEnded).toBe(false);
                expect(passedWait.hasEnded).toBe(false);
                yield waitFor(eventA);
                expect(eventA.value).toBe(100);
        });
    });

});