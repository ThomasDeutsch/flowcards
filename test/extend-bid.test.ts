import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { askFor, block, extend, extendAll, request, trigger, waitFor } from "../src/bid";
import { delay } from "./test-utils";
import { testSchedulerFactory } from "./utils";

describe("the extend bid behavior", () => {

    test('when an event gets extended, it will be marked as pending', () => {
        let requestingFlow: Flow;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            requestingFlow = this.flow(function* () {
                yield request(eventA, 101);
            }, [])
            this.flow(function* () {
                yield extend(eventA);
                 // an ended flow will keep the extend pending.
            }, []);
            yield undefined;
        });
        expect(requestingFlow!.hasEnded).toBe(false);
        expect(eventA.isPending).toBe(true);
    });

    test('an extend can be resolved with a request bid by the extending flow', () => {
        let requestingFlow: Flow;
        let extendingFlow: Flow;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            requestingFlow = this.flow(function* () {
                yield request(eventA, 101);
                expect(eventA.isPending).toBe(false);
            }, [])
            extendingFlow = this.flow(function* () {
                yield extend(eventA);
                expect(eventA.isPending).toBe(true);
                expect(eventA.value).toBe(undefined);
                yield request(eventA, 102);
                expect(eventA.isPending).toBe(false);
            }, []);
            yield undefined;
        });
        expect(requestingFlow!.hasEnded).toBe(true);
        expect(extendingFlow!.hasEnded).toBe(true);
        expect(eventA.isPending).toBe(false);
        expect(eventA.value).toBe(102);
    });

    test('an extend can be resolved with an askFor bid by the extending flow', () => {
        let askForFlow: Flow;
        let extendingFlow: Flow;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            askForFlow = this.flow(function* () {
                yield askFor(eventA);
            }, [])
            extendingFlow = this.flow(function* () {
                yield extend(eventA);
                expect(eventA.value).toBe(undefined);
                expect(eventA.extendedValue).toBe(20);
                yield trigger(eventA, 10);
            }, []);
            yield trigger(eventA, 20);
            yield undefined;
        });
        expect(askForFlow!.hasEnded).toBe(true);
        expect(extendingFlow!.hasEnded).toBe(true);
        expect(eventA.isPending).toBe(false);
        expect(eventA.value).toBe(10);
    });

    test('an extend can be resolved with an askFor bid & event.dispatch', (done) => {
        let askForFlow: Flow;
        let extendingFlow: Flow;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            askForFlow = this.flow(function* () {
                yield askFor(eventA);
            }, [])
            extendingFlow = this.flow(function* () {
                yield extend(eventA);
                expect(eventA.value).toBe(undefined);
                expect(eventA.extendedValue).toBe(30);
                yield request(eventA, 1000);
            }, []);
            yield waitFor(eventA);
            expect(askForFlow!.hasEnded).toBe(true);
            expect(extendingFlow!.hasEnded).toBe(true);
            expect(eventA.value).toBe(1000);
            done();
        });
        eventA.set(30);
    });

    test('after an extend resolves, it can be extended again.', () => {
        let requestingFlow, extendFlow1, extendFlow2: Flow;
        const progressionOrder: string[] = [];
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            requestingFlow = this.flow(function* () {
                yield request(eventA, 1);
                progressionOrder.push('requestingFlow');
            }, [])
            extendFlow1 = this.flow(function* () {
                yield extend(eventA);
                progressionOrder.push('extendFlow1');
                yield request(eventA, 3);
            }, []);
            extendFlow2 = this.flow(function* () {
                yield extend(eventA);
                progressionOrder.push('extendFlow2');
                yield request(eventA, 2);
            }, []);
            yield waitFor(eventA); // this waitFor is processed, after all extends have been resolved.
            expect(progressionOrder).toEqual(['extendFlow2', 'extendFlow1', 'requestingFlow']);
            expect(requestingFlow!.hasEnded).toBe(true);
            expect(extendFlow1!.hasEnded).toBe(true);
            expect(extendFlow2!.hasEnded).toBe(true);
            expect(eventA.isPending).toBe(false);
            expect(eventA.value).toBe(3);
        });

    });

    test('if a pending request gets extended, the extend will continue on resolve', (done) => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            const requestFlow = this.flow(function* requestFlow() {
                yield request(eventA, () => delay(100, 1));
                expect(eventA.value).toBe(1000);
            }, [])
            this.flow(function* extendFlow() {
                yield extend(eventA);
                expect(eventA.extendedValue).toBe(1);
                yield request(eventA, 1000);
                yield undefined;
            }, []);
            yield waitFor(eventA);
            expect(eventA.value).toBe(1000);
            expect(requestFlow.hasEnded).toBe(true);
            done();
        });
    });

    test('if a pending request gets extended, the extending flow can cancel the request', (done) => {
        const eventA = new Event<number>('eventA');
        const cancelEvent = new Event<number>('cancelEvent');
        testSchedulerFactory(function*(this: Flow) {
            this.flow(function* requestFlow() {
                yield request(eventA, () => delay(100, 1));
                expect(1).toBe(5); // the event got canceled, and not resolved by the extending flow.
            }, [])
            this.flow(function* extendFlow() {
                yield [extend(eventA), request(cancelEvent, 1), block(cancelEvent, () => !eventA.isPending)];
                //expect(eventA.extendedValue).toBe(undefined);
                yield request(cancelEvent, () => delay(500, 1));
                expect(eventA.isPending).toBe(true);
                done();
                yield undefined;
            }, []);
            yield undefined;
        });
    })

    test('an extend bid can have a validate function and will only extend when valid', () => {
        let requestingFlow: Flow;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            requestingFlow = this.flow(function* () {
                yield request(eventA, 101);
            }, [])
            this.flow(function* () {
                yield extend(eventA, () => false);
            }, []);
            yield undefined;

        });
        expect(requestingFlow!.hasEnded).toBe(true);
        expect(eventA.isPending).toBe(false);
    });

    test('a pending extend can be aborted', () => {
        let requestingFlow: Flow, extendingFlow: Flow;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            requestingFlow = this.flow(function* () {
                yield request(eventA, 101);
            }, [])
            extendingFlow = this.flow(function* (this: Flow) {
                yield extend(eventA);
                this.resolveExtend(eventA);
            }, []);
            yield undefined;

        });
        expect(requestingFlow!.hasEnded).toBe(true);
        expect(extendingFlow!.hasEnded).toBe(true);
        expect(eventA.isPending).toBe(false);
        expect(eventA.value).toBe(101);
    });

    test("the utility function extendAll will extend multiple bids from an NestedEventObject", (done) => {
        const events = {
            A: new Event('A'),
            B: new Event('B'),
            C: new Event('C'),
            notExtend: {
                A: new Event('allowed.A'),
                B: new Event('allowed.B')
            }
        }
        let eventExtended = 0;
        let eventNotExtended = 0;
        const flow1 =  function* () {
            while(true) {
                yield [askFor(events.A), askFor(events.notExtend.A)];
            }
        };
        const extendFlow = function* (this: Flow) {
            while(true) {
                yield* extendAll([events], [events.notExtend]);
                expect(this.pendingExtends.has(events.notExtend.A.id)).toBe(false);
                expect(this.pendingExtends.has(events.A.id)).toBe(true);
                done();
            }
        }
        testSchedulerFactory(function*(this: Flow) {
            this.flow(flow1, []);
            this.flow(extendFlow, []);
            yield undefined;
        });

        if(eventExtended === 0 && events.A.isValid(undefined)) {
            eventExtended++;
            events.A.set(undefined);
        }
        if(eventNotExtended === 0 && events.notExtend.A.isValid(undefined)) {
            eventNotExtended++;
            events.notExtend.A.set(undefined);
        }
    });
});