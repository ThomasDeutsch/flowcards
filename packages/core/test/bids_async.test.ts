/* eslint-disable @typescript-eslint/explicit-function-return-type */
import bp from "../src/bid";
import { createUpdateLoop, ScaffoldingFunction } from '../src/updateloop';
import { Logger } from "../src/logger";
import { ThreadState } from '../src/bthread';

type TestLoop = (enable: ScaffoldingFunction) => Logger;
let testLoop: TestLoop;

beforeEach(() => {
    testLoop = (enable: ScaffoldingFunction): Logger => {
        const logger = new Logger();
        createUpdateLoop(enable, () => null, logger)();
        return logger;
    };
});

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


test("A promise can be requested", () => {
    function* thread1() {
        yield bp.request("A", delay(100));
    }
    const logger = testLoop((enable) => {
        enable(thread1);
    });
    const threadReaction = logger.getLatestReactions().thread1;
    expect(logger.getLatestAction().eventName).toBe("A");
    expect(logger.getLatestReactionThreads()).toContain("thread1");
    expect(threadReaction.type).toBe("promise");
});


test("A promise-function can be requested", () => {
    function* thread1() {
        yield bp.request("A", () => delay(100));
    }
    const logger = testLoop((enable) => {
        enable(thread1);
    });
    const threadReaction = logger.getLatestReactions().thread1;
    expect(logger.getLatestAction().eventName).toBe("A");
    expect(logger.getLatestReactionThreads()).toContain("thread1");
    expect(threadReaction.type).toBe("promise");
});


test("multiple promises can be requested and pending", () => {
    let state: ThreadState;
    function* thread1() {
        yield [bp.request("A", () => delay(1000)), bp.request("B", () => delay(1000))];
    }
    testLoop((enable) => {
        state = enable(thread1);
    });
    expect(state.pendingEvents).toContain("A");
    expect(state.pendingEvents).toContain("B");
    expect(state.nrProgressions).toBe(2);
});


test("while a thread is pending a request, it will not request it again", () => {
    let state: ThreadState;
    function* thread1() {
        while (true) {
            yield bp.request("A", () => delay(1000));
        }
    }
    testLoop((enable) => {
        state = enable(thread1);
    });
    expect(state.nrProgressions).toBe(1);
});


test("a pending request can be cancelled", () => {
    let isCancelled;
    function* thread1() {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, eventName] = yield [bp.request("A", () => delay(1000)), bp.wait("B")];
        isCancelled = eventName === "B" ? true : false;
    }
    function* thread2() {
        yield bp.request("B");
        isCancelled = true;
    }
    testLoop((enable) => {
        const { pendingEvents } = enable(thread1);
        if (pendingEvents && pendingEvents.size > 0) {
            enable(thread2);
        }
    });
    expect(isCancelled).toBe(true);
});


test("when an async request is fulfilled, the thread will not progress until the promise ist resolved", () => {
    let isAdvanced = false;

    function* thread1() {
        yield bp.request("A", () => delay(1000));
        isAdvanced = true;
    }
    testLoop((enable) => {
        const { pendingEvents } = enable(thread1);
        if (pendingEvents && pendingEvents.size > 0) {
            enable(thread1);
        }
    });
    
    expect(isAdvanced).toBe(false);
});

// test("A promise response is dispatched", () => {
//     // INCLUDE FAILED REQUESTS?
//     expect(1).toBe(2);
// });

// test("If one promise is resolved, other promises for this yield are cancelled", () => {
//     expect(1).toBe(2);
// });

// test("an override is only active, if the promise is pending", () => {
//     expect(1).toBe(2);
// });

// test("A requested promise can throw an error. This error can be try/catched in the generator", () => {
//     expect(1).toBe(2);
// });


// - when an async request is started, the thread is not advanced