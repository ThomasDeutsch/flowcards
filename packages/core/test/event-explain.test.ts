import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { flow } from '../src/scenario';

test("the explain function will show the validation result for a wait", () => {
    const waitingThread = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => val > 1000);
    })

    testScenarios((enable) => {
        enable(waitingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).explain(1).isValid).toBeFalsy();
    });
});

test("the explain function will respect all threads that are waiting for a specific event", () => {
    const waitingThreadA = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => val > 1000);
    });
    const waitingThreadB = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => val > 100);
    });

    testScenarios((enable) => {
        enable(waitingThreadA());
        enable(waitingThreadB());
    }, ({event}) => {
        // with a payload of 1
        expect(event({name: 'A'}).explain(1).isValid).toBeFalsy();
        expect(event({name: 'A'}).explain(1).messages.length).toBe(0);
        expect(event({name: 'A'}).explain(1).willProgress.size).toBe(0);
        // with a payload of 500
        expect(event({name: 'A'}).explain(500).isValid).toBeTruthy();
        expect(event({name: 'A'}).explain(500).passed.size).toBe(1);
        expect(event({name: 'A'}).explain(500).rejected.size).toBe(1);
    });
});


// const x = {threadId: 'threadX', eventId: 'A', bidType: 'wait', message: 'x needs to be bigger than X' }

test("the explain function can show the validation details for a wait", () => {
    const waitingThread = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => ({isValid: val > 1000, message: 'value needs to be bigger than 1000'}));
    });

    testScenarios((enable) => {
        enable(waitingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).isPending).toBeTruthy();
        expect(event({name: 'A'}).dispatch).toBeUndefined();
    });
});
