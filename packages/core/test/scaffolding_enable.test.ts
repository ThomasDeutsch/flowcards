/* eslint-disable @typescript-eslint/explicit-function-return-type */

import bp from "../src/bid";
import { createUpdateLoop, ScaffoldingFunction } from '../src/updateloop';
import { Logger } from "../src/logger";
import { ThreadContext } from "../src/bthread";

type TestLoop = (enable: ScaffoldingFunction) => Logger;
let updateLoop: TestLoop;

beforeEach(() => {
    updateLoop = (enable: ScaffoldingFunction): Logger => {
        const logger = new Logger();
        createUpdateLoop(enable, () => null, logger)();
        return logger;
    };
});


test("a thread will accept an optional array of arguments", () => {
    let receivedArgs = ["", "", ""];

    function* thread(a: string, b: string, c: string) {
        receivedArgs = [a, b, c];
        yield bp.wait('event');
    }

    updateLoop((enable) => {
        enable(thread, ["A", "B", "C"]);
    });

    expect(receivedArgs[0]).toBe("A");
    expect(receivedArgs[1]).toBe("B"); 
    expect(receivedArgs[2]).toBe("C"); 
});


test("a thread will accept an optional key", () => {
    let receivedKeyA, receivedKeyB;

    function* thread(this: ThreadContext) {
        receivedKeyA = this.key;
        yield bp.wait('A');
    }

    function* threadB(this: ThreadContext) {
        receivedKeyB = this.key;
        yield bp.wait('A');
    }

    updateLoop((enable) => {
        enable(thread, [], 0);
        enable(threadB, [], "foo");
    });

    expect(receivedKeyA).toBe(0); 
    expect(receivedKeyB).toBe("foo");
});



test("if no key is provided, the default key value is null", () => {
    let receivedKeyA;

    function* thread(this: ThreadContext) {
        receivedKeyA = this.key;
        yield bp.wait('A');
    }

    updateLoop((enable) => {
        enable(thread);
    });

    expect(receivedKeyA).toBeNull(); 
});