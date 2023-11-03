import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { askFor, extend, trigger, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";
import { delay } from "./test-utils";
import { ExternalAction } from "../src";

/**
 * a placed askFor bid will allow the event to be triggered, by an external source, with event.trigger(<value>) or by a trigger bid (placed by a flow)
 */
describe("askFor and trigger", () => {

    test('when an askFor bid is placed, and the trigger is valid isValid(<value>), the event can be triggered with event.trigger(<value>)', (done) => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory(function*(this: Flow) {
            yield askFor(eventA);
        }, {eventA}, [{
            effect: () => {
                console.log('eventA, is valid:', eventA.isValid(123));
                eventA.trigger(123);
            },
        },
        {
            action: {
                type: 'external',
                payload: 123,
                id: 0,
                eventId: 'eventA',
                flowId: 'test',
                bidId: 0
            },
            reactions: [
                {
                    flowPath: [ 'test' ],
                    type: 'flow progressed on a bid',
                    details: { bidId: 0, bidType: 'askFor', eventId: 'eventA', actionId: 0 }
                },
                { flowPath: [ 'test' ], type: 'flow ended', details: {} }
            ], effect: () => { done();}
        },
        ]);
    });

    // wie stelle ich mir das vor?
    // der test wird augeführt, ich kann mir den log anschauen und sehe was passiert ist
    // wenn das richtig ist, dann kann ich den log als testfall übernehmen

    test('when an askFor bid is placed, a trigger-bid will proceed when the event is valid', () => {
        let askForFlow: Flow | undefined;
        let requestFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.flow('subflow', function* () {
                yield askFor(eventA);
            }, []);
            requestFlow = this.flow('subflow2', function* () {
                yield trigger(eventA, 123);
            }, []);
            yield undefined;
        }, {eventA});
        expect(askForFlow?.hasEnded).toBe(true);
        expect(requestFlow?.hasEnded).toBe(true);
        expect(eventA.value).toBe(123);
    });

    test('an askFor is not valid if the bid itself is blocked', () => {
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
                yield trigger(eventA, 123);
            }, []);
            yield undefined;

        }, {eventA});
        expect(requestFlow!?.hasEnded).toBe(false);
        expect(askForFlow!?.hasEnded).toBe(false);
        expect(askForFlow!?.hasEnded).toBe(false);
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
        }, {eventA});
        eventA.trigger(10)
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
        }, {eventA});
        expect(eventA.isValid(1)).toBe(false);
        expect(eventA.isValid(11)).toBe(true);
        expect(eventA.validate(10).payloadValidation?.results?.length).toBe(0);
    })

    test('can be tested for valid payload (custom validation type)', () => {
        let askForFlow: Flow | undefined;
        const eventA = new Event<number, string>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.flow('subflow', function* () {
                yield askFor(eventA, (x) => ({isValid: true, details: ['abc']}));
            }, []);
            yield undefined;
        }, {eventA});
        expect(eventA.isValid(11)).toBe(true);
        expect(eventA.validate(10).payloadValidation?.results?.length).toBe(1);
        expect(eventA.validate(10).payloadValidation?.results).toBe('abc'); //TODO
    })

    test('will not allow an invalid value to be set', () => {
        let askForFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.flow('subflow', function* () {
                yield askFor(eventA, (x) => x < 10);
            }, []);
            yield undefined;
        }, {eventA});
        expect(eventA.isValid(10)).toBe(false);
        expect(eventA.isValid(9)).toBe(true);
        expect(eventA.value).toBe(undefined);
        expect(eventA.trigger(10)).toThrow(Error);
    })

    test('trigger will thrown an error if the payload is invalid, and the request is async', (done) => {
        let askForFlow: Flow | undefined;
        let requestFlow: Flow | undefined;
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            askForFlow = this.flow('subflow', function* () {
                yield askFor(eventA, (x) => x < 10);
            }, []);
            requestFlow = this.flow('requestFlow', function* () {
                try {
                    yield trigger(eventA, () => delay(100, 11));
                } catch (e) {
                    expect(e).toBeDefined();
                    done();
                    yield undefined;

                }
                yield undefined;
            }, []);
            yield undefined;
        }, {eventA});
    })
});