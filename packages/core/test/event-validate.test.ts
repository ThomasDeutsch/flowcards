import * as bp from "../src/bid";
import { testScenarios } from './testutils';
import { flow } from '../src/scenario';

test("the validate function will show the validation result for a wait", () => {
    const waitingThread = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => val > 1000);
    })

    testScenarios((enable) => {
        enable(waitingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1)?.isValid).toBe(false);
        expect(event({name: 'A'}).validate(1001)?.isValid).toBe(true);
    });
});

test("the validate the specific event, and not matching events", () => {
    const waitingThreadA = flow(null, function* () {
        yield bp.wait({name: 'A', key: 1}, (val) => val > 1000);
    });
    const waitingThreadB = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => val > 100);
    });

    testScenarios((enable) => {
        enable(waitingThreadA());
        enable(waitingThreadB());
    }, ({event}) => {
        expect(event({name: 'A', key: 1}).validate(1)?.isValid).toBe(false);
        expect(event({name: 'A', key: 1}).validate(101)?.isValid).toBe(false);
        expect(event({name: 'A'}).validate(101)?.isValid).toBe(true);
        expect(event({name: 'A', key: 1}).validate(1001)?.isValid).toBe(true);
    });
});

test("the validate function can show the validation details for a wait", () => {
    const waitingThread = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => ({isValid: val > 1000, message: 'value needs to be bigger than 1000'}));
    });
    
    testScenarios((enable) => {
        enable(waitingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1)?.isValid).toBe(false);
        expect(event({name: 'A'}).validate(1)?.required[0][0].message).toEqual('value needs to be bigger than 1000');
        expect(event({name: 'A'}).validate(1)?.required[0][0].isValid).toEqual(false);
        expect(event({name: 'A'}).validate(1001)?.isValid).toBe(true);
        expect(event({name: 'A'}).validate(1001)?.required[0][0].message).toEqual('value needs to be bigger than 1000');
        expect(event({name: 'A'}).validate(1001)?.required[0][0].isValid).toEqual(true);
    });
});


test("the validate function will respect block-bids", () => {
    const waitingThread = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => ({isValid: val > 1000, message: 'value needs to be bigger than 1000'}));
    });
    const blockingThread = flow(null, function* () {
        yield bp.block({name: 'A'}, (val) => ({isValid: val < 2000, message: 'value needs to be smaller than 2000'}));
    });

    testScenarios((enable) => {
        enable(waitingThread());
        enable(blockingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1)?.isValid).toBe(false);
        expect(event({name: 'A'}).validate(1001)?.required[1][0].message).toEqual('value needs to be smaller than 2000');
        expect(event({name: 'A'}).validate(1001)?.required[1][0].isValid).toBe(false);

    });
});

test("the validate function will respect on-bids as optional", () => {
    const waitingThread = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => ({isValid: val > 1000, message: 'value needs to be bigger than 1000'}));
    });
    const blockingThread = flow(null, function* () {
        yield bp.on({name: 'A'}, (val) => ({isValid: val < 2000, message: 'value needs to be smaller than 2000'}));
    });

    testScenarios((enable) => {
        enable(waitingThread());
        enable(blockingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1)?.isValid).toBe(false);
        expect(event({name: 'A'}).validate(1001)?.optional[0].message).toEqual('value needs to be smaller than 2000');
        expect(event({name: 'A'}).validate(1001)?.optional[0].isValid).toBe(true);
    });
});

test("a event can have a description text that can be viewed in the validate result", () => {
    const waitingThread = flow(null, function* () {
        yield bp.wait({name: 'A'}, (val) => ({isValid: val > 1000, message: 'value needs to be bigger than 1000'}));
    });
    const blockingThread = flow(null, function* () {
        yield bp.block({name: 'A', description: 'event A is not possible'});
    });

    testScenarios((enable) => {
        enable(waitingThread());
        enable(blockingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1)?.isValid).toBe(false);
        expect(event({name: 'A'}).validate(1)?.required[1][0].message).toEqual('event A is not possible');
    });
});