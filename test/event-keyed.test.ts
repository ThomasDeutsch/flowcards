import { Flow } from "../src/flow";
import { EventByKey } from "../src/event";
import { request } from "../src/bid";
import { testSchedulerFactory } from "./utils";


describe("events can have a key", () => {

    test('a key is of type string and the event needs to be created as EventByKey', () => {
        const eventAKeyed = new EventByKey<number>('eventA');
        const myFirstFlow = function*(this: Flow) {
            yield request(eventAKeyed.key('test'), 1);
            
        }
        testSchedulerFactory(myFirstFlow);
        expect(eventAKeyed.key('test')?.value).toBe(1);
    });
});