  
import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { scenario } from '../src/scenario';



test("a wait is not advanced, if the guard returns false", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;
    let waitCAdvanced = false;

    const threadA = scenario(null, function* () {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    });

    const threadB = scenario(null, function* () {
        yield bp.askFor("A", (pl: number) => pl !== 1000);
        waitBAdvanced = true;
    })

    const threadC = scenario(null, function* () {
        yield bp.askFor("A", (pl: number) => pl === 1000);
        waitCAdvanced = true;
    });

    testScenarios((enable) => {
        enable(threadA());
        enable(threadB());
        enable(threadC());
    }, () => {
        expect(requestAdvanced).toBe(true);
        expect(waitBAdvanced).toBe(false);
        expect(waitCAdvanced).toBe(true);
    });
});


test("an extend is not applied, if the guard returns false.", () => {
    let requestAdvanced = false;
    let waitAdvanced = false;
    let extendAdvanced = false;

    const threadA = scenario(null, function* () {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    });

    const threadB = scenario(null, function* () {
        yield bp.askFor("A", (pl: number) => pl === 1000);
        waitAdvanced = true;
    });

    const threadC = scenario(null, function* () {
        yield bp.extend("A", (pl: number) => {
            return {isValid: pl !== 1000}
        });
        extendAdvanced = true;
    });

    testScenarios((enable) => {
        enable(threadA());
        enable(threadB());
        enable(threadC());
    }, () => {
        expect(extendAdvanced).toBe(false);
        expect(waitAdvanced).toBe(true);
        expect(requestAdvanced).toBe(true);
    });
});

test("bids can be extended by a validation-bid  ", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;

    const threadA = scenario(null, function* () {
        yield bp.askFor("A");
        requestAdvanced = true;
    });

    const threadB = scenario(null, function* () {
        yield bp.validate("A", (pl: number) => pl !== 1000);
        waitBAdvanced = true;
    })

    const [context] = testScenarios((enable) => {
        enable(threadA());
        enable(threadB());
    }, () => {
        expect(requestAdvanced).toBe(false);
        expect(waitBAdvanced).toBe(false);
    });
    expect(context.event('A').validate(1000).isValid).toBe(false);
    expect(context.event('A').validate(1).isValid).toBe(true);
});