import { Scenario, ScenarioKeyed } from "../src";
import * as bp from "../src/bid";
import { ScenarioEvent } from "../src/scenario-event";
import { delay, testScenarios } from "./testutils";


test("a requested event that is not blocked will advance", () => {

    const basicEvent = {
        eventA: new ScenarioEvent<number>('A'),
        eventB: new ScenarioEvent<number>('B')
    }

    const requestingThread = new ScenarioKeyed('thread1', function*() {
        const progress = yield bp.request(basicEvent.eventA, 1);
        expect(progress.event).toBe(basicEvent.eventA);
    });

    testScenarios((s, e) => {
        e(basicEvent.eventA, basicEvent.eventB);
        s(requestingThread.key(1), {a: 123});
    }, ()=> {
        expect(requestingThread.key(1).isCompleted).toBe(true);
    });
});
