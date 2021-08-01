import { ScenarioKeyed } from "../src";
import * as bp from "../src/bid";
import { ScenarioEvent } from "../src/scenario-event";
import { testScenarios } from "./testutils";


test("the enable-events function will accept a record of ScenarioEvents", () => {

    const basicEvent = {
        eventA: new ScenarioEvent<number>('A'),
        eventB: new ScenarioEvent<number>('B')
    }

    const requestingThread = new ScenarioKeyed('thread1', function*() {
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

    const eventA = new ScenarioEvent<number>('A');
    const eventB = new ScenarioEvent<number>('B');

    const requestingThread = new ScenarioKeyed('thread1', function*() {
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
