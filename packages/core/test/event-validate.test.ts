import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { flow } from '../src/scenario';

test("the validate function will show the validation result for a wait", () => {
    const waitingThread = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => val > 1000);
    })

    testScenarios((enable) => {
        enable(waitingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1).isValid).toBe(true);
    });
});

test("the validate function will respect all threads that are waiting for a specific event", () => {
    const waitingThreadA = flow(null, function* () {
        yield bp.wait({name: 'A', key: 1}, (val) => val > 1000);
    });
    const waitingThreadB = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => val > 100);
    });

    // show what threads are progressing
    // for every thread that has a wait or an on
    // - for every wait, get the validation + all block validations
    // - for every on, look if there is at least one wait + all block validations
    testScenarios((enable) => {
        enable(waitingThreadA());
        enable(waitingThreadB());
    }, ({event}) => {
        // with a payload of 1
        expect(event({name: 'A', key: 1}).validate(1)?.isValid).toBeFalsy();
        expect(event({name: 'A'}).validate(1)?.passed.length).toBe(0);
        expect(event({name: 'A'}).validate(1)?.failed.length).toBe(2);
    });
});


// const x = {threadId: 'threadX', eventId: 'A', bidType: 'wait', message: 'x needs to be bigger than X' }

test("the validate function can show the validation details for a wait", () => {
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