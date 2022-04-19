import { Flow, FlowKeyed } from "flow";
import * as bp from "bid";
import { FlowEvent, FlowEventKeyed } from "../src/event-core";
import { testScenarios } from "./testutils";


test("scenarios can be keyed", () => {

    const basicEvent = {
        eventA: new FlowEvent<number>('A'),
        eventB: new FlowEvent<number>('B')
    }

    const requestingThread = new FlowKeyed('thread1', function*() {
        const progress = yield bp.request(basicEvent.eventA, 1);
        expect(progress.event).toBe(basicEvent.eventA);
        expect(this.key).toBe(1);
    });

    testScenarios((s) => {
        s(requestingThread.key(1));
    }, basicEvent, ()=> {
        expect(requestingThread.key(1).isCompleted).toBe(true);
    });
});



test("a keyed scenario can progress without the other keyed scenario being progressed", () => {

    const eventA = new FlowEventKeyed<number>('A');

    const waitingThread = new FlowKeyed('thread1', function*() {
        yield bp.waitFor(eventA.key(this.key!)); //TODO: key is not undefined!!
        if(this.key === 1) {
            expect(eventA.key(this.key).value).toBe(1);
        }
    });

    const requestingThread = new Flow('thread1', function*() {
        yield bp.request(eventA.key(1), 1);
    });

    testScenarios((s) => {
        s(requestingThread);
        s(waitingThread.key(1));
        s(waitingThread.key(2));
    }, [...eventA.keys(1, 2)], ()=> {
        expect(waitingThread.key(1).isCompleted).toBe(true);
        expect(waitingThread.key(2).isCompleted).toBe(false);
    });
});
