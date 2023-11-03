import { Flow } from "../src/flow";
import { EventByKey } from "../src/event";
import { request } from "../src/bid";
import { testSchedulerFactory } from "./utils";


describe("events can have a key", () => {

    test('a key is of type string or number and the event needs to be created as EventByKey', () => {
        const eventAKeyed = new EventByKey<number>('eventA');
        const myFirstFlow = function*(this: Flow) {
            yield request(eventAKeyed.getEvent(1), 1);
            yield request(eventAKeyed.getEvent('test'), 2);
        }
        testSchedulerFactory(myFirstFlow);
        expect(eventAKeyed.getEvent(1)?.value).toBe(1);
        expect(eventAKeyed.getEvent('test')?.value).toBe(2);
        expect(eventAKeyed.allKeys()).toEqual([1, 'test']);
    });
});