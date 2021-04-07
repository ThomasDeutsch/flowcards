  
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
        yield bp.extend("A", (pl: number) => pl !== 1000);
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


import Ajv from 'ajv';
const ajv = new Ajv() // options can be passed, e.g. {allErrors: true}

const schema = {
  type: "object",
  properties: {
    foo: {type: "integer"},
    bar: {type: "string"}
  },
  required: ["foo"],
  additionalProperties: false
}

const validate = ajv.compile(schema)

// TODO: TEST WITH ASKFOR BIDS + VALIDATION BIDS