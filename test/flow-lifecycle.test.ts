import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { request, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";


describe("a flow execution", () => {

    test('will automatically restart if this.end() is missing', () => {
        const eventA = new Event<number>('eventA');
        let nrBids = 0;
        testSchedulerFactory(function*(this: Flow) {
            this.flow(function* child1(this: Flow) {
                nrBids++;
                yield request(eventA, 1);
                if(nrBids === 3) {
                    
                }
            }, []);
            yield waitFor(eventA);
            yield waitFor(eventA);
            yield waitFor(eventA);
            expect(nrBids).toBe(3);
            
        });
    });
});