import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { flow } from '../src/scenario';


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
        enable(waitingThread());
        enable(requestingThread());
    }, ({log})=> {
        expect(hasAdvancedFirstTrigger).toBe(true);
        expect(hasAdvancedSecondTrigger).toBe(false);
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
        enable(waitingThread());
        enable(requestingThread());
        enable(blockingThread());
    }, ()=> {
        expect(hasAdvancedTrigger).toBe(false);
    });
});


test("a trigger needs to fulfill the wait-guard validation.", () => {
    let hasAdvancedTrigger1 = false;
    let hasAdvancedTrigger2 = false;

    const waitingThread = flow({id: 'waitingThread'}, function*() {
        while(true) {
            yield bp.wait("eventA", (pl) => pl > 100);
        }
    });

    const requestingThread1 = flow({id: 'requestingThread1'}, function*() {
        yield bp.trigger("eventA", 101);
        hasAdvancedTrigger1 = true;
    });

    const requestingThread2 = flow({id: 'requestingThread2'}, function*() {
        yield bp.trigger("eventA", 0);
        hasAdvancedTrigger2 = true;
    });

    testScenarios((enable) => {
        enable(waitingThread());
        enable(requestingThread1());
        enable(requestingThread2());
    }, ()=> {
        expect(hasAdvancedTrigger1).toBe(true);
        expect(hasAdvancedTrigger2).toBe(false);
    });
});