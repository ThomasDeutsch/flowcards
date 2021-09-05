import { Scenario } from "../src";
import * as bp from "../src/bid";
import { ScenarioEvent } from "../src/scenario-event";
import { testScenarios } from "./testutils";

test("the logger will provide a map of relevant Scenarios", () => {

    const basicEvent = {
        eventA: new ScenarioEvent<number>('A'),
        eventB: new ScenarioEvent<number>('B'),
        eventC: new ScenarioEvent<number>('C'),
        eventD: new ScenarioEvent('D')
    }

    const requestingThread = new Scenario('requestingThread', function*() {
        yield [bp.request(basicEvent.eventC, 1), bp.request(basicEvent.eventA, 1)];
        yield bp.askFor(basicEvent.eventD);
    });
    const waitingThread = new Scenario('waitingThread', function*() {
        yield bp.waitFor(basicEvent.eventA);
    });
    const relevantBlock= new Scenario('relevantBlock', function*() {
        yield bp.block(basicEvent.eventC);
    });
    const notRelevantBlock= new Scenario('notRelevantBlock', function*() {
        yield bp.block(basicEvent.eventB);
    });
    const notRelevantValidation= new Scenario('notRelevantValidation', function*() {
        yield bp.validate(basicEvent.eventB, (v) => v !== undefined && v > 0);
    });
    const relevantValidation= new Scenario('relevantValidation', function*() {
        yield bp.validate(basicEvent.eventC, (v) => v !== undefined && v > 0);
    });
    const relevantTrigger = new Scenario('relevantTrigger', function*() {
        yield bp.trigger(basicEvent.eventD);
    });
    const notRelevantTrigger = new Scenario('notRelevantTrigger', function*() {
        yield bp.trigger(basicEvent.eventB);
    });

    testScenarios((s, e) => {
        e(basicEvent);
        s(requestingThread);
        s(waitingThread);
        s(relevantBlock);
        s(notRelevantBlock);
        s(notRelevantValidation);
        s(relevantValidation);
        s(relevantTrigger);
        s(notRelevantTrigger);
    }, ({logs})=> {
        const threads = logs[logs.length-1].scenarioIds;
        expect(threads.has('requestingThread')).toBe(true);
        expect(threads.has('waitingThread')).toBe(true);
        expect(threads.has('relevantBlock')).toBe(true);
        expect(threads.has('notRelevantBlock')).toBe(false);
        expect(threads.has('notRelevantValidation')).toBe(false);
        expect(threads.has('relevantValidation')).toBe(true);
        expect(threads.has('relevantTrigger')).toBe(true);
        expect(threads.has('notRelevantTrigger')).toBe(false);
    });
});
