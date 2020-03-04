import bp from "../src/bid";
import { createUpdateLoop, ScaffoldingFunction, UpdateLoopFunction } from '../src/updateloop';
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
    let receivedKey;

    function* thread(this: ThreadContext) {
        receivedKey = this.key;
        yield bp.wait('A');
    }

    updateLoop((enable) => {
        enable(thread, [], 1);
    });

    expect(receivedKey).toBe(1); 
});