// describe unit tests for the validate function for different bid types as well as the validate bid itself

import { Flow } from "../src/flow";
import { Event, EventUpdateInfo } from "../src/event";
import { askFor, extend, request, syncedRequest, validate, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";
import { delay } from "./test-utils";

describe("the optional validate function for each bid-type", () => {

    test('an askFor bid can be validated', () => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            yield askFor(eventA, (value) => value > 10);
        });
        expect(eventA.explainSetter).toBe('enabled');
        expect(eventA.isValid(12)).toBe(true);
        expect(eventA.isValid(9)).toBe(false);
    });

    test('a request bid can be validated', () => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            yield request(eventA, 12, (value) => value > 10);
        });
        expect(eventA.value).toBe(12);
    });

    test('an extend can be validated', () => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        let requestingAFlow: Flow | undefined;
        let requestingBFlow: Flow | undefined;
        testSchedulerFactory( function*(this: Flow) {
            this.flow('extendAFlow', function* () {
                yield extend(eventA, (value) => value > 10);
                yield undefined;
            }, []);
            this.flow('extendBFlow', function* () {
                yield extend(eventB, (value) => value > 10);
                yield undefined;
            }, []);
            requestingAFlow = this.flow('requestingAFlow', function* () {
                yield request(eventA, 10);
            }, []);
            requestingBFlow = this.flow('requestingBFlow', function* () {
                yield request(eventB, 11);

            }, []);
            yield undefined;
        });
        expect(eventA.isPending).toBe(false);
        expect(eventB.isPending).toBe(true);
        expect(requestingAFlow?.hasEnded).toBe(true);
        expect(requestingBFlow?.hasEnded).toBe(false);

    });

    test('an async request bid can be validated. The validation will throw an error after the request has been resolved', (done) => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            try {
                yield request(eventA, () => delay(100, 9), (value) => value > 10);
            }
            catch(error: any) {
                expect(error.message).toBe('async request rejected');
                done();
            }
        });
    });

    test('a requestIfAskedFor bid can be validated', () => {
        const eventA = new Event<number>('eventA');
        let triggerSuccess = false;
        testSchedulerFactory(function*(this: Flow) {
            this.flow('subflow', function* () {
                while(true) {
                    yield askFor(eventA);
                }
            }, []);
            yield syncedRequest(eventA, 12, (value) => value > 10);
            triggerSuccess = true;
            yield undefined;
        });
        expect(triggerSuccess).toBe(true);
        expect(eventA.explainSetter).toBe('enabled');
        expect(eventA.isValid(12)).toBe(true);
        expect(eventA.isValid(9)).toBe(true);
    });

    test('a waitFor bid will only progress if the valid function returns true', () => {
        const eventA = new Event<number>('eventA');
        let progressedValid = false;
        let progressedInvalid = false;
        testSchedulerFactory(function*(this: Flow) {
            this.flow('subflow', function* () {
                yield request(eventA, 10);
            }, []);
            this.flow('subflow2', function* () {
                yield waitFor(eventA, (value) => value > 10);
                progressedInvalid = true;
            }, []);
            this.flow('subflow3', function* () {
                yield waitFor(eventA, (value) => value === 10);
                progressedValid = true;
            }, []);
            yield undefined;
        });
        expect(progressedValid).toBe(true);
        expect(progressedInvalid).toBe(false);
    });

    test('multiple validation functions are combined', () => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            this.flow('subflow', function* () {
                yield askFor(eventA, (value) => value > 10);
            }, []);
            this.flow('subflow2', function* () {
                yield validate(eventA, (value) => value > 20);
            }, []);
            this.flow('subflow3', function* () {
                yield validate(eventA, (value) => value > 30);
            }, []);
            yield undefined;
        });
        expect(eventA.explainSetter).toBe('enabled');
        expect(eventA.isValid(10)).toBe(false);
        expect(eventA.isValid(20)).toBe(false);
        expect(eventA.isValid(30)).toBe(false);
        expect(eventA.isValid(31)).toBe(true);
    });

    test('the event is updated if the combined validation function changes', (done) => {
        let updateCount = 0;
        const eventB = new Event<number>('eventB');
        const eventA = new Event<number>('eventA');
        eventA.registerCallback((x) => {
            updateCount++;
        });
        testSchedulerFactory(function*(this: Flow) {
            this.flow('subflow', function* () {
                yield askFor(eventA, (value) => value > 10);
            }, []);
            this.flow('subflow2', function* () {
                yield validate(eventA, (value) => value > 20);
            }, []);
            this.flow('subflow3', function* () {
                yield request(eventB, () => delay(100, 30));
                expect(updateCount).toBe(1); // initial update
                yield [validate(eventA, (value) => value > 30), request(eventB, () => delay(100, 40))];
                expect(updateCount).toBe(2); // update after validation function changed
            }, []);
            yield waitFor(eventB);
            yield waitFor(eventB);
            expect(updateCount).toBe(2);
            done();
            yield undefined;
        });
        expect(eventA.explainSetter).toBe('enabled');
    });
});