/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { Logger, scenarios} from "../src/index";


function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


test("A promise can be requested", () => {
    function* thread1() {
        yield bp.request("A", delay(100));
    }
    const logger = new Logger();
    scenarios((enable) => {
        enable(thread1);
    }, null, logger);
    expect(logger.getLatestAction().eventName).toBe("A");
    expect(logger.getLatestReactions().threadIds).toContain("thread1");
    expect(logger.getLatestReactions().type.thread1).toBe("promise");
});


test("A promise-function can be requested", () => {
    function* thread1() {
        yield bp.request("A", () => delay(100));
    }
    const logger = new Logger();
    scenarios((enable) => {
        enable(thread1);
    }, null, logger);
    expect(logger.getLatestAction().eventName).toBe("A");
    expect(logger.getLatestReactions().threadIds).toContain("thread1");
    expect( logger.getLatestReactions().type.thread1).toBe("promise");
});


test("multiple promises can be requested and pending", () => {
    let state: any = null;
    
    function* thread1() {
        yield [bp.request("A", () => delay(1000)), bp.request("B", () => delay(1000))];
    }

    scenarios((enable) => {
        state = enable(thread1);
    });

    if(state) {
        expect(state.pendingEvents).toContain("A");
        expect(state.pendingEvents).toContain("B");
        expect(state.nrProgressions).toBe(2);
    }
});


test("while a thread is pending a request, it will not request it again", () => {
    let state: any = null;
    function* thread1() {
        while (true) {
            yield bp.request("A", () => delay(1000));
        }
    }
    scenarios((enable) => {
        state = enable(thread1);
    });

    if(state) {
        expect(state.nrProgressions).toBe(1);
    }
    
});


test("a pending request can be cancelled", () => {
    let isCancelled;
    function* thread1() {
        const [eventName] = yield [bp.request("A", () => delay(1000)), bp.wait("B")];
        isCancelled = eventName === "B" ? true : false;
    }
    function* thread2() {
        yield bp.request("B");
        isCancelled = true;
    }
    scenarios((enable) => {
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
    scenarios((enable) => {
        enable(thread1);
    });
    
    expect(isAdvanced).toBe(false);
});


test("If one promise is resolved, other promises for this yield are cancelled", done => {
    function* thread1() {
        const [event] = yield [bp.request("A", () => delay(1000)), bp.request("B", () => delay(100))];
        expect(event).toBe("B");
        done();
    }
    scenarios((enable) => {
        enable(thread1);
    });
});