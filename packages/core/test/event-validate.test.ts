import * as bp from "../src/bid";
import { delay, testScenarios } from './testutils';
import { scenario } from '../src/scenario';


test("a validate bid will add validation to an existing bid", () => {
    const askingThread = scenario(null, function* () {
        yield bp.askFor({name: 'A'});
    })

    const validatingThread = scenario(null, function* () {
        yield bp.validate({name: 'A'}, (val) => val > 1000);
    })

    testScenarios((enable) => {
        enable(askingThread());
        enable(validatingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1).isValid).not.toBe(true);
        expect(event({name: 'A'}).validate(1).failed.length).toBe(1);
        expect(event({name: 'A'}).validate(1).failed[0].type).toBe('payloadValidation');
    });
});

test("a validate bid will add validation to an existing bid (request)", () => {
    const askingThread = scenario(null, function* () {
        yield bp.request({name: 'A'}, 1);
    })

    const validatingThread = scenario(null, function* () {
        yield bp.validate({name: 'A'}, (val) => val > 1000);
    })

    testScenarios((enable) => {
        enable(askingThread());
        enable(validatingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1).isValid).not.toBe(true);
        expect(event({name: 'A'}).validate(1).failed.length).toBe(1);
        expect(event({name: 'A'}).validate(1).failed[0].type).toBe('noAskForBid');
    });
});

test("the validate function will show the validation result for an askFor", () => {
    const waitingThread = scenario(null, function* () {
        yield bp.askFor({name: 'A'}, (val) => val > 1000);
    })

    testScenarios((enable) => {
        enable(waitingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1).isValid).not.toBe(true);
        expect(event({name: 'A'}).validate(1001).isValid).toBe(true);
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
        expect(event({name: 'A', key: 1}).validate(1).isValid).not.toBe(true);
        expect(event({name: 'A', key: 1}).validate(101).isValid).not.toBe(true);
        expect(event({name: 'A', key: 1}).validate(1001).isValid).toBe(true);
        expect(event({name: 'A', key: 2}).validate(1).isValid).toBe(false);
        expect(event({name: 'A', key: 2}).validate(101).isValid).toBe(true);
        expect(event({name: 'A', key: 2}).validate(1001).isValid).toBe(true);
    });
});

test("a validation can include datails", () => {
    const askingThread = scenario(null, function* () {
        yield bp.askFor({name: 'A'});
    })

    const validatingThread = scenario(null, function* () {
        yield bp.validate({name: 'A'}, (val) => ({
            isValid: val > 1000,
            details: 'min: 1000'
        }));
    })

    testScenarios((enable) => {
        enable(askingThread());
        enable(validatingThread());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1).isValid).not.toBe(true);
        expect(event({name: 'A'}).validate(1).failed.length).toBe(1);
        expect(event({name: 'A'}).validate(1).failed[0].type).toBe('payloadValidation');
        expect(event({name: 'A'}).validate(1).failed[0].type).toBe('payloadValidation');
        expect(event({name: 'A'}).validate(1).failed[0].details).toBe('min: 1000');

    });
});


test("a blocked askFor Event will return a validation with the blocking bThread Id", () => {
    const askingThread = scenario(null, function* () {
        yield bp.askFor({name: 'A'});
    })

    const blockingThead = scenario(null, function* () {
        yield bp.block({name: 'A'});
    })

    testScenarios((enable) => {
        enable(askingThread());
        enable(blockingThead());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1).failed.length).toBe(1);
        expect(event({name: 'A'}).validate(1).failed[0].type).toBe('blocked');
    });
});


test("a pending askFor Event will return a validation with the pending bThread Id", () => {
    const askingThread = scenario(null, function* () {
        yield bp.askFor({name: 'A'});
    })

    const blockingThead = scenario({id: 'requestingBThread'}, function* () {
        yield bp.request({name: 'A'}, delay(5000, 'val'));
    })

    testScenarios((enable) => {
        enable(askingThread());
        enable(blockingThead());
    }, ({event}) => {
        expect(event({name: 'A'}).validate(1).failed.length).toBe(1);
        expect(event({name: 'A'}).validate(1).failed[0].type).toBe('pending');
        expect(event({name: 'A'}).validate(1).failed[0].details).toBe('event is pending by BThread: requestingBThread');
    });
});