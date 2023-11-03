import { Flow } from "../src/flow";
import { Event, EventByKey, NestedEventObject } from "../src/event";
import { askFor, request, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";
import { extendAll, getAllValues, getFirstValue, getValue } from "../src";


describe("different flow utility functions", () => {

    test("the getAllValues utility function will progress the flow if all (progressable) bids have progressed", (done) => {
        const eventA = new Event<number>('eventA');
        const eventB = new Event<number>('eventB');
        testSchedulerFactory( function*(this: Flow) {
            const [a, b] = yield* getAllValues(request(eventA, 1), request(eventB, 2));
            expect(eventA.value).toBe(1);
            expect(eventB.value).toBe(2);
            expect(a).toBe(1);
            expect(b).toBe(2);
            done();
            yield undefined;
        });
    });

    test("the getValue utility function will return the current value of the event, at the time the flow progresses", (done) => {
        const eventA = new Event<number>('eventA');
        testSchedulerFactory( function*(this: Flow) {
            const a = yield* getValue(request(eventA, 1));
            expect(eventA.value).toBe(1);
            expect(a).toBe(1);
            done();
            yield undefined;
        });
    });

    test("extend all values that are asked for", (done) => {
        const event = {
            root: {
              dialog: new Event<number | null>('rootDialog'),
              allMatArtCodesResult: new Event<number[] | undefined>('root.matArtCodeResult'),
              serviceStatus: new Event<number>('root.serviceStatus'),
            },
            riskCharacteristic: {
              search: new Event<number>('riskCharacteristic.search'),
              searchResult: new Event<number | undefined>('riskCharacteristic.searchResult'),
              selectEditMode: new Event<number | undefined>('riskCharacteristic.selectEditMode'),
              selectCreateMode: new Event('riskCharacteristic.selectCreateMode'),
              selectAssignMode: new Event<number | undefined>('riskCharacteristic.selectAssignMode'),
              result: new Event<number | undefined>('riskCharacteristic.result'),
              save: new Event<number>('riskCharacteristic.save'),
              abort: new Event<boolean>('riskCharacteristic.abort'),
              parent: new Event<number | string>('riskCharacteristic.parent'),
              parentResults: new Event<number[] | undefined>('riskCharacteristic.parentResults'),
              parentSearch: new EventByKey<number | undefined>('riskCharacteristic.parentSearch'),
              allCharacteristicDataTypes: new Event<number[]>('riskCharacteristic.allCharacteristicDataTypes'),
              leaveEditModeWithoutSave: new Event<boolean>('riskCharacteristic.leaveEditModeWithoutSave'),
              editedCharacteristicHasChanges: new Event<boolean>('riskCharacteristic.editedCharacteristicHasChanges'),
            }
          } as const satisfies NestedEventObject;

        testSchedulerFactory( function*(this: Flow) {
            const extendingFlow = this.flow('extendingFlow', function*() {
                const [extendedEvent] = yield* extendAll([event], (event) => event.isAskedFor);
                expect(extendedEvent).toBe(event.riskCharacteristic.search);
                done();
            }, []);
            this.flow('requestingFlow', function*() {
                yield request(event.riskCharacteristic.search, 100);
                yield request(event.root.dialog, 200)
            }, []);
            this.flow('askingFlow', function*() {
                yield askFor(event.riskCharacteristic.search);
            }, []);
            yield undefined;
        });
    });
})


