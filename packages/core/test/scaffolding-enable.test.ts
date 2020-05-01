/* eslint-disable @typescript-eslint/explicit-function-return-type */

import * as bp from "../src/bid";
import { scenarios } from "./testutils";
import { BTContext } from "../src/bthread";


test("a thread will accept an optional array of arguments", () => {
    let receivedArgs = ["", "", ""];

    function* thread(a: string, b: string, c: string) {
        receivedArgs = [a, b, c];
        yield bp.wait('event');
    }

    scenarios((enable) => {
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

    scenarios((enable) => {
        enable(thread, [], 0);
        enable(threadB, [], "foo");
    });

    expect(receivedKeyA).toBe(0); 
    expect(receivedKeyB).toBe("foo");
});



test("if no key is provided, the default key value is null", () => {
    let receivedKeyA;

    function* thread(this: BTContext) {
        receivedKeyA = this.key;
        yield bp.wait('A');
    }

    scenarios((enable) => {
        enable(thread);
    });

    expect(receivedKeyA).toBeUndefined(); 
});