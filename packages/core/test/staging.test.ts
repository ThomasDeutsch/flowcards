import { BThreadKeyed } from "../src";
import * as bp from "../src/bid";
import { TEvent } from "../src/b-event";
import { testScenarios } from "./testutils";


test("the enable-events function will accept a record of ScenarioEvents", () => {

    const basicEvent = {
        eventA: new TEvent<number>('A'),
        eventB: new TEvent<number>('B')
    }

    const requestingThread = new BThreadKeyed('thread1', function*() {
        const progress = yield bp.request(basicEvent.eventA, 1);
        expect(progress.event).toBe(basicEvent.eventA);
        expect(this.key).toBe(1);
    });

    testScenarios((s, e) => {
        e(basicEvent);
        s(requestingThread.key(1));
    }, ()=> {
        expect(requestingThread.key(1).isCompleted).toBe(true);
    });
});

test("the enable-events function will accept single ScenarioEvents", () => {

    const eventA = new TEvent<number>('A');
    const eventB = new TEvent<number>('B');

    const requestingThread = new BThreadKeyed('thread1', function*() {
        const progress = yield bp.request(eventA, 1);
        expect(progress.event).toBe(eventA);
        expect(this.key).toBe(1);
    });

    testScenarios((s, e) => {
        e(eventA, eventB);
        s(requestingThread.key(1));
    }, ()=> {
        expect(requestingThread.key(1).isCompleted).toBe(true);
    });
});
