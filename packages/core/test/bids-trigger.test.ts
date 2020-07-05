import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { flow } from '../src/flow';


test("a trigger is a request, that is only selected if another thread is waiting for the same event.", () => {
    let hasAdvancedFirstTrigger = false;
    let hasAdvancedSecondTrigger = false;

    const waitingThread = flow({id: 'waitingThread'}, function*() {
        yield bp.wait("eventA");
        yield bp.wait("eventB");
    });

    const requestingThread = flow({id: 'requestingThread'}, function*() {
        yield bp.trigger("eventA");
        hasAdvancedFirstTrigger = true;
        yield bp.trigger("eventA");
        hasAdvancedSecondTrigger = true;
    });

    testScenarios((enable) => {
        enable(waitingThread([]));
        enable(requestingThread([]));
    }, ({log})=> {
        expect(hasAdvancedFirstTrigger).toBe(true);
        expect(hasAdvancedSecondTrigger).toBe(false);
        expect(log?.latestAction.event.name).toBe("eventA");
    });
});


test("a trigger is a request, that can be blocked.", () => {
    let hasAdvancedTrigger = false;

    const waitingThread = flow({id: 'waitingThread'}, function*() {
        yield bp.wait("eventA");
    });

    const requestingThread = flow({id: 'requestingThread'}, function*() {
        yield bp.trigger("eventA");
        hasAdvancedTrigger = true;
    });

    const blockingThread = flow({id: 'blockingThread'}, function*() {
        yield bp.block('eventA');
    });

    testScenarios((enable) => {
        enable(waitingThread([]));
        enable(requestingThread([]));
        enable(blockingThread([]));
    }, ()=> {
        expect(hasAdvancedTrigger).toBe(false);
    });
});