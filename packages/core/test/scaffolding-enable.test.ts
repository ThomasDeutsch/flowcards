import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { BTContext, BThreadState } from '../src/bthread';
import { toEvent } from '../src/event';


test("a thread will accept an optional array of arguments", () => {
    let receivedArgs = ["", "", ""];

    function* thread(a: string, b: string, c: string) {
        receivedArgs = [a, b, c];
        yield bp.wait('event');
    }

    testScenarios((enable) => {
        enable(thread, ["A", "B", "C"]);
    });

    expect(receivedArgs[0]).toBe("A");
    expect(receivedArgs[1]).toBe("B"); 
    expect(receivedArgs[2]).toBe("C"); 
});


test("a thread will accept an optional key", () => {
    let receivedKeyA, receivedKeyB;

    function* thread(this: BTContext) {
        receivedKeyA = this.key;
        yield bp.wait('A');
    }

    function* threadB(this: BTContext) {
        receivedKeyB = this.key;
        yield bp.wait('A');
    }

    testScenarios((enable) => {
        enable(thread, [], 0);
        enable(threadB, [], "foo");
    });

    expect(receivedKeyA).toBe(0); 
    expect(receivedKeyB).toBe("foo");
});



test("if no key is provided, the default key value is undefined", () => {
    let receivedKeyA;

    function* thread(this: BTContext) {
        receivedKeyA = this.key;
        yield bp.wait('A');
    }

    testScenarios((enable) => {
        enable(thread);
    });

    expect(receivedKeyA).toBeUndefined(); 
});


test("enable will return the current thread-state (check waits)", () => {
    let threadState: BThreadState;

    function* thread(this: BTContext) {
        yield bp.wait('A');
    }

    testScenarios((enable) => {
        threadState = enable(thread);
        expect(threadState?.isWaitingFor('A')).toBe(true);
    });
});


test("enable will return the current thread-state (state value)", () => {
    let threadState: BThreadState;

    function* thread(this: BTContext) {
        this.setState('my state value');
        yield bp.wait('A');
    }

    testScenarios((enable) => {
        threadState = enable(thread);
        expect(threadState?.current).toEqual('my state value');
    });
});