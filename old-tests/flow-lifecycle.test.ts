import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { askFor, extend, request, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";
import { delay } from "./test-utils.ts";
import { getValue } from "../src";


describe("a flow execution", () => {

    test('will not automaticall restart after a flow is ended', (done: Function) => {
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

    test('.endFlows() will end all child-flows', (done: Function) => {
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

    test('if a flow that has a pending request gets disabled, the request is canceled', (done: Function) => {
        const eventA = new Event<number>('eventA');
        const controlEvent = new Event<boolean>('control');
        let subflow: Flow | undefined;
        let nr = 1;
        let requestWasPending = false;

        testSchedulerFactory(function*(this: Flow) {
            while(true) {
                const enable = yield* getValue(request(controlEvent, () => nr === 1));
                this.context('context', () => {
                    if (enable) {
                        subflow = this.flow('subflow', function* () {
                            yield request(eventA, () => delay(500, 123)); // Long delay
                        }, []);
                    }
                })
                if (subflow?.bids[0]?.event === eventA && subflow?.bids[0]?.type === 'request') {
                    requestWasPending = eventA.isPending;
                }
                if(nr === 2) {
                    yield undefined; // End main flow
                }
                nr++;
            }
        });

        // Initially, flow is enabled, request starts and becomes pending
        expect(subflow?.isDisabled).toBe(false);
        expect(requestWasPending).toBe(true);
        expect(eventA.isPending).toBe(true);

        // Trigger next cycle, disabling the context and the flow
        controlEvent.set(false);

        // Check that the flow is disabled and the pending request was canceled
        expect(subflow?.isDisabled).toBe(true);
        expect(eventA.isPending).toBe(false); // Should be canceled
        done();
    });

    test('if a flow that has a pending extend gets disabled, the extend bid remains active', (done: Function) => {
        const eventA = new Event<number>('eventA');
        const controlEvent = new Event<boolean>('control');
        let extendingFlow: Flow | undefined;
        let requestingFlow: Flow | undefined;
        let nr = 1;
        let extendWasPending = false;

        testSchedulerFactory(function*(this: Flow) {
            requestingFlow = this.flow('requestingFlow', function*() {
                yield request(eventA, 1);
                // This flow should not proceed until extend is resolved or canceled
            }, []);

            while(true) {
                const enable = yield* getValue(request(controlEvent, () => nr === 1));
                this.context('context', () => {
                    if (enable) {
                        extendingFlow = this.flow('extendingFlow', function* () {
                            yield extend(eventA); // Extend eventA
                            // Stay pending, don't resolve the extend
                            yield waitFor(new Event('never'));
                        }, []);
                    }
                })
                if (extendingFlow?.bids[0]?.event === eventA && extendingFlow?.bids[0]?.type === 'extend') {
                    extendWasPending = eventA.isPending;
                }
                if(nr === 2) {
                    yield undefined; // End main flow
                }
                nr++;
            }
        });

        // Initially, flow is enabled, extend starts and becomes pending
        expect(extendingFlow?.isDisabled).toBe(false);
        expect(extendWasPending).toBe(true);
        expect(eventA.isPending).toBe(true); // Event is pending due to extend
        expect(requestingFlow?.hasEnded).toBe(false);

        // Trigger next cycle, disabling the context and the extending flow
        controlEvent.set(false);

        // Check that the extending flow is disabled
        expect(extendingFlow?.isDisabled).toBe(true);
        // CRITICAL: Check that the event is STILL pending because the extend bid persists
        expect(eventA.isPending).toBe(true);
        expect(requestingFlow?.hasEnded).toBe(false); // Requesting flow still blocked

        // Re-enable the context
        controlEvent.set(true);
        expect(extendingFlow?.isDisabled).toBe(false);
        expect(eventA.isPending).toBe(true); // Still pending

        // Now, let's resolve the extend from the re-enabled flow (e.g., by ending it)
        extendingFlow?.endFlows(); // Or could resolve with request, abortExtend etc.
        // Need a scheduler cycle for the resolution to process
        // Typically testSchedulerFactory handles cycles, but may need explicit step if async
        // For simplicity here, we assume the test setup runs another cycle implicitly or use a delay/waitFor
        setTimeout(() => {
            expect(eventA.isPending).toBe(false); // Extend resolved
            expect(requestingFlow?.hasEnded).toBe(true); // Original request could finally proceed
            done();
        }, 50); // Small delay to allow potential async operations
    });

    test('a disabled flow will not place any bids', (done: Function) => {
        const eventA = new Event<number>('eventA');
        const controlEvent = new Event<boolean>('control');
        let subflow: Flow | undefined;
        let nr = 1;

        testSchedulerFactory(function*(this: Flow) {
            while(nr <= 2) {
                // Control context activation via controlEvent
                const enable = yield* getValue(request(controlEvent, () => nr === 2)); // Enable only on second round
                this.context('context', () => {
                    if (enable) {
                        subflow = this.flow('subflow', function* () {
                            yield request(eventA, 123); // This bid should only be placed when enabled
                        }, []);
                    }
                })
                // Check state after context processing
                if (nr === 1) {
                    // First round: Context should be inactive, flow disabled
                    expect(subflow?.isDisabled).toBe(true);
                    expect(eventA.value).toBeUndefined(); // No request bid placed
                } else {
                    // Second round: Context active, flow enabled
                    expect(subflow?.isDisabled).toBe(false);
                }
                nr++;
                if (nr > 2) yield undefined; // Finish after checks
            }
        });

        // After scheduler runs:
        // Wait for the request placed in the second round to complete
        setTimeout(() => {
             expect(eventA.value).toBe(123); // Bid should have been placed and processed
             done();
        }, 50);
    });

    test('a cleanup callback is called as soon as the flow resets or ends', (done: Function) => {
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