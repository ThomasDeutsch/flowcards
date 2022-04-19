import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { Flow } from '../src/flow';
import { FlowEvent, UserEvent } from "event";


test("a validation result can be a boolean", () => {
    const eventA = new FlowEvent<number>('A');

    const thread1 = new Flow('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, (n) => n > 100)]
    });

    testScenarios((enable) => {
        enable(thread1);
    }, eventA, () => {
        expect(thread1.isCompleted).toBe(false);
    }
 );
});


test("a validation result can be an array of failed values", () => {
    const eventA = new FlowEvent<number>('A');

    const thread1 = new Flow('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => ['error'])]
    });

    testScenarios((enable) => {
        enable(thread1);
    }, eventA, () => {
        expect(thread1.isCompleted).toBe(false);
    }
 );
});


test("a validation result can be an array of failed values - the validation is passed if the array is empty", () => {
    const eventA = new FlowEvent<number>('A');

    const thread1 = new Flow('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => [])]
    });

    testScenarios((enable) => {
        enable(thread1);
    }, eventA, () => {
        expect(thread1.isCompleted).toBe(true);
    }
 );
});


test("a validation result can also be an object with failed and passed arrays", () => {
    const eventA = new FlowEvent<number>('A');

    const thread1 = new Flow('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => ({failed: ['123']}))]
    });

    testScenarios((enable) => {
       enable(thread1);
    }, eventA, () => {
        expect(thread1.isCompleted).toBe(false);
    }
 );
});


test("a validation result can also be an object with failed and passed arrays - if the failed array is empty, the validation is passed", () => {
    const eventA = new FlowEvent<number>('A');

    const thread1 = new Flow('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => ({failed: []}))]
    });

    testScenarios((enable) => {
        enable(thread1);
    }, eventA, () => {
        expect(thread1.isCompleted).toBe(true);
    }
 );
});


test("a validation result can also be an object - if the object has a missing failed array, the validation is passed", () => {
    const eventA = new FlowEvent<number>('A');

    const thread1 = new Flow('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => ({passed: []}))]
    });

    testScenarios((enable) => {
        enable(thread1);
    }, eventA, () => {
        expect(thread1.isCompleted).toBe(true);
    }
 );
});


test("multiple validations are combined", () => {
    const eventA = new FlowEvent<number>('A');

    const thread1 = new Flow('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => ({passed: []})), bp.validate(eventA, () => false)]
    });

    testScenarios((enable) => {
        enable(thread1);
    }, eventA, () => {
        expect(thread1.isCompleted).toBe(false);
    }
 );
});


test("a validate function will return the combined event validation result", () => {
    const eventA = new UserEvent<number, string>('A');

    const thread1 = new Flow('requesting thread', function* () {
        yield [bp.askFor(eventA),
            bp.validate(eventA, () => ({passed: ['passed']})),
            bp.validate(eventA, () => ({failed: ['failed']}))]
    });

    testScenarios((enable) => {
        enable(thread1);
    }, eventA, () => {
        expect(eventA.explain(1).isValid).toBe(false);
        expect(eventA.explain(1).passed.length).toBe(1);
        expect(eventA.explain(1).passed[0]).toBe('passed');
        expect(eventA.explain(1).failed[0]).toBe('failed');
    }
 );
});


test("if there are multiple askFor bids for the same event, the validations are not combined", () => {
    const eventA = new UserEvent<number, string>('A');

    const threadLow = new Flow('threadLow', function* () {
        yield bp.askFor(eventA, (x) => x > 0);
    });

    const threadHigh = new Flow('threadHigh', function* () {
        yield bp.askFor(eventA, (x) => x > 5);
    });

    testScenarios((enable) => {
        enable(threadLow);
        enable(threadHigh);

    }, eventA, () => {
        expect(eventA.isValid(1)).toBe(false);
        expect(eventA.isValid(6)).toBe(true);

    }
 );
});


interface ValidationReturn {
    description: string
}

test("an event can be provided with a validation type", () => {
    const eventA = new UserEvent<number, ValidationReturn>('A');

    const askingThread = new Flow('askingThread', function* () {
        yield bp.askFor(eventA, () => ({failed: [{description: '123'}]}));
    });

    testScenarios((enable) => {
        enable(askingThread);

    }, eventA, () => {
        expect(eventA.explain(1).isValid).toBe(false);

    }
 );
});
