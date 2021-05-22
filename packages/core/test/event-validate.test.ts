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