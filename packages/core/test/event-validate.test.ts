import * as bp from "../src/bid";
import { testScenarios } from './testutils';
import { scenario } from '../src/scenario';

test("the validate function will show the validation result for an askFor", () => {
    const waitingThread = scenario(null, function* () {
        yield bp.askFor({name: 'A'}, (val) => val > 1000);
    })

    testScenarios((enable) => {
        enable(waitingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1)?.isValid).toBe(false);
        expect(event({name: 'A'}).validate(1001)?.isValid).toBe(true);
    });
});

test("a validation will include the keyed events.", () => {
    const asking1 = scenario({id: 'asking1'}, function* () {
        yield bp.askFor({name: 'A', key: 1}, (val) => val > 1000);
    });
    const asking2 = scenario({id: 'asking2'}, function* () {
        yield bp.askFor({name: 'A', key: 2}, (val) => val > 100);
    });

    testScenarios((enable) => {
        enable(asking1());
        enable(asking2());
    }, ({event}) => {
        expect(event({name: 'A', key: 1}).validate(1)?.isValid).toBe(false);
        expect(event({name: 'A', key: 1}).validate(101)?.isValid).toBe(false);
        expect(event({name: 'A', key: 1}).validate(1001)?.isValid).toBe(true);
        expect(event({name: 'A', key: 2}).validate(1)?.isValid).toBe(false);
        expect(event({name: 'A', key: 2}).validate(101)?.isValid).toBe(true);
        expect(event({name: 'A', key: 2}).validate(1001)?.isValid).toBe(true);
        expect(event({name: 'A'}).validate(1)?.isValid).toBe(false);
        expect(event({name: 'A'}).validate(101)?.isValid).toBe(true);
        expect(event({name: 'A'}).validate(1001)?.isValid).toBe(true);
    });
});

test("a validation will tell what bThreads are progressing", () => {
    const asking1 = scenario({id: 'asking1'}, function* () {
        yield bp.askFor({name: 'A', key: 1}, (val) => val > 1000);
    });
    const asking2 = scenario({id: 'asking2'}, function* () {
        yield bp.askFor({name: 'A', key: 2}, (val) => val > 100);
    });

    testScenarios((enable) => {
        enable(asking1());
        enable(asking2());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1)?.progressing.length).toBe(0);
        expect(event({name: 'A'}).validate(101)?.progressing.length).toBe(1);
        expect(event({name: 'A'}).validate(101)?.progressing[0].name).toBe('asking1');
        expect(event({name: 'A'}).validate(101)?.progressing[1].name).toBeUndefined();
        expect(event({name: 'A'}).validate(1001)?.progressing.length).toBe(2);
        expect(event({name: 'A'}).validate(1001)?.progressing[0].name).toBe('asking1');
        expect(event({name: 'A'}).validate(1001)?.progressing[1].name).toBe('asking2');
    });
});


test("the validate function can show the validation details for a wait", () => {
    const waitingThread = scenario(null, function* () {
        yield bp.askFor({name: 'A'}, (val) => ({isValid: val > 1000, message: 'value needs to be bigger than 1000'}));
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
    const waitingThread = scenario(null, function* () {
        yield bp.askFor({name: 'A'}, (val) => ({isValid: val > 1000, message: 'value needs to be bigger than 1000'}));
    });
    const blockingThread = scenario(null, function* () {
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

test("the validate function will respect waitFor-bids as optional", () => {
    const waitingThread = scenario(null, function* () {
        yield bp.askFor({name: 'A'}, (val) => ({isValid: val > 1000, message: 'value needs to be bigger than 1000'}));
    });
    const blockingThread = scenario(null, function* () {
        yield bp.waitFor({name: 'A'}, (val) => ({isValid: val < 2000, message: 'value needs to be smaller than 2000'}));
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
    const waitingThread = scenario(null, function* () {
        yield bp.askFor({name: 'A'}, (val) => ({isValid: val > 1000, message: 'value needs to be bigger than 1000'}));
    });
    const blockingThread = scenario(null, function* () {
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


//TODO: add tests for required and optional props of the validation object