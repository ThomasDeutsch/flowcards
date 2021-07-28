import { Scenario, ScenarioKeyed } from "../src";
import * as bp from "../src/bid";
import { ScenarioEvent, ScenarioEventKeyed } from "../src/scenario-event";
import { delay, testScenarios } from "./testutils";


test("scenarios can be keyed", () => {

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
        e(basicEvent.eventA, basicEvent.eventB);
        s(requestingThread.key(1));
    }, ()=> {
        expect(requestingThread.key(1).isCompleted).toBe(true);
    });
});


test("a keyed scenario can progress without the other keyed scenario being progressed", () => {

    const eventA = new ScenarioEventKeyed<number>('A');

    const waitingThread = new ScenarioKeyed('thread1', function*() {
        yield bp.waitFor(eventA.key(this.key!)); //TODO: key is not undefined!!
        if(this.key === 1) {
            expect(eventA.key(this.key).value).toBe(1);
        }
    });

    const requestingThread = new Scenario('thread1', function*() {
        yield bp.request(eventA.key(1), 1);
    });

    testScenarios((s, e) => {
        e(...eventA.keys(1, 2));
        s(requestingThread);
        s(waitingThread.key(1));
        s(waitingThread.key(2));
    }, ()=> {
        expect(waitingThread.key(1).isCompleted).toBe(true);
        expect(waitingThread.key(2).isCompleted).toBe(false);
    });
});
