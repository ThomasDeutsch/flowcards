import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { BThread } from '../src/b-thread';
import { BEvent } from "../src";


test("a validation result can be a boolean", () => {
    const eventA = new BEvent<number>('A');

    const thread1 = new BThread('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, (n) => n > 100)]
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
    }, () => {
        expect(thread1.isCompleted).toBe(false);
    }
 );
});


test("a validation result can be an array of failed values", () => {
    const eventA = new BEvent<number>('A');

    const thread1 = new BThread('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => ['error'])]
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
    }, () => {
        expect(thread1.isCompleted).toBe(false);
    }
 );
});


test("a validation result can be an array of failed values - the validation is passed if the array is empty", () => {
    const eventA = new BEvent<number>('A');

    const thread1 = new BThread('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => [])]
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
    }, () => {
        expect(thread1.isCompleted).toBe(true);
    }
 );
});


test("a validation result can also be an object with failed and passed arrays", () => {
    const eventA = new BEvent<number>('A');

    const thread1 = new BThread('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => ({failed: ['123']}))]
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
    }, () => {
        expect(thread1.isCompleted).toBe(false);
    }
 );
});


test("a validation result can also be an object with failed and passed arrays - if the failed array is empty, the validation is passed", () => {
    const eventA = new BEvent<number>('A');

    const thread1 = new BThread('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => ({failed: []}))]
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
    }, () => {
        expect(thread1.isCompleted).toBe(true);
    }
 );
});


test("a validation result can also be an object - if the object has a missing failed array, the validation is passed", () => {
    const eventA = new BEvent<number>('A');

    const thread1 = new BThread('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => ({passed: []}))]
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
    }, () => {
        expect(thread1.isCompleted).toBe(true);
    }
 );
});


test("multiple validations are combined", () => {
    const eventA = new BEvent<number>('A');

    const thread1 = new BThread('requesting thread', function* () {
        yield [bp.request(eventA, 1), bp.validate(eventA, () => ({passed: []})), bp.validate(eventA, () => false)]
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
    }, () => {
        expect(thread1.isCompleted).toBe(false);
    }
 );
});


test("a validate function will return the combined event validation result", () => {
    const eventA = new BEvent<number, string>('A');

    const thread1 = new BThread('requesting thread', function* () {
        yield [bp.askFor(eventA),
            bp.validate(eventA, () => ({passed: ['passed']})),
            bp.validate(eventA, () => ({failed: ['failed']}))]
    });

    testScenarios((enable, events) => {
        events(eventA);
        enable(thread1);
    }, () => {
        expect(eventA.validate(1).isValid).toBe(false);
        expect(eventA.validate(1).passed.length).toBe(1);
        expect(eventA.validate(1).passed[0]).toBe('passed');
        expect(eventA.validate(1).failed[0]).toBe('failed');
    }
 );
});
