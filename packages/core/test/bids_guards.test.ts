import bp from "../src/bid";
import { createUpdateLoop, ScaffoldingFunction, UpdateLoopFunction } from '../src/updateloop';
import { Logger } from "../src/logger";

type TestLoop = (enable: ScaffoldingFunction) => Logger;
let updateLoop: TestLoop;

beforeEach(() => {
    updateLoop = (enable: ScaffoldingFunction): Logger => {
        const logger = new Logger();
        createUpdateLoop(enable, () => null, logger)();
        return logger;
    };
});


test("a wait is not advanced, if the guard returns false", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;
    let waitCAdvanced = false;


    function* threadA() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* threadB() {
        yield bp.wait("A", (pl: number) => pl !== 1000);
        waitBAdvanced = true;
    }

    function* threadC() {
        yield bp.wait("A", (pl: number) => pl === 1000);
        waitCAdvanced = true;
    }

    const logger = updateLoop((enable: any) => {
        enable(threadA);
        enable(threadB);
        enable(threadC);
    });

    expect(requestAdvanced).toBe(true);
    expect(waitBAdvanced).toBe(false);
    expect(waitCAdvanced).toBe(true);
    expect(logger.getLatestAction().eventName).toBe("A");
});


test("an intercept is not applied, if the guard returns false.", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;
    let waitCAdvanced = false;


    function* threadA() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* threadB() {
        yield bp.wait("A", (pl: number) => pl === 1000);
        waitBAdvanced = true;
    }

    function* threadC() {
        yield bp.intercept("A", (pl: number) => pl !== 1000);
        waitCAdvanced = true;
    }

    const logger = updateLoop((enable: any) => {
        enable(threadA);
        enable(threadB);
        enable(threadC);
    });

    expect(requestAdvanced).toBe(true);
    expect(waitBAdvanced).toBe(true);
    expect(waitCAdvanced).toBe(false);
    expect(logger.getLatestAction().eventName).toBe("A");
});


test("if an intercept is not applied, than the next intercept will get the event", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;
    let waitCAdvanced = false;
    let waitDAdvanced = false;

    function* requestThread() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* waitThread() {
        yield bp.wait("A", (pl: number) => pl === 1000);
        waitBAdvanced = true;
    }

    function* interceptPrioLowThread() {
        yield bp.intercept("A", (pl: number) => pl === 1000);
        waitCAdvanced = true;
    }

    function* interceptPrioHighThread() {
        yield bp.intercept("A", (pl: number) => pl !== 1000);
        waitDAdvanced = true;
    }

    const logger = updateLoop((enable: any) => {
        enable(requestThread);
        enable(waitThread);
        enable(interceptPrioLowThread);
        enable(interceptPrioHighThread);
    });

    expect(requestAdvanced).toBe(true);
    expect(waitBAdvanced).toBe(false);
    expect(waitCAdvanced).toBe(true);
    expect(waitDAdvanced).toBe(false);
    expect(logger.getLatestAction().eventName).toBe("A");
});


test("a block is applied, if the guard returns true", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;
    let waitCAdvanced = false;


    function* threadA() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* threadB() {
        yield bp.block("A", (pl: number) => pl === 1000);
        waitBAdvanced = true;
    }

    function* threadC() {
        yield bp.wait("A");
        waitCAdvanced = true;
    }

    updateLoop((enable: any) => {
        enable(threadA);
        enable(threadB);
        enable(threadC);
    });

    expect(requestAdvanced).toBe(false);
    expect(waitBAdvanced).toBe(false);
    expect(waitCAdvanced).toBe(false);
});


test("a block is not applied, if the guard returns false", () => {
    let requestAdvanced = false;
    let waitAdvanced = false;


    function* threadA() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* threadB() {
        yield bp.block("A", (pl: number) => pl !== 1000);
    }

    function* threadC() {
        yield bp.wait("A");
        waitAdvanced = true;
    }

    updateLoop((enable: any) => {
        enable(threadA);
        enable(threadB);
        enable(threadC);
    });

    expect(requestAdvanced).toBe(true);
    expect(waitAdvanced).toBe(true);
});


test("guards for blocks will be merged", () => {
    let requestAdvanced = false;
    let waitAdvanced = false;


    function* requestThread() {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    }

    function* blockingThread() {
        yield bp.block("A");
    }

    function* notBlockingThread() {
        yield bp.block("A", (pl: number) => pl !== 1000);
    }

    function* waitingThread() {
        yield bp.wait("A");
        waitAdvanced = true;
    }

    updateLoop((enable: any) => {
        enable(requestThread);
        enable(blockingThread);
        enable(notBlockingThread);
        enable(waitingThread);
    });

    expect(requestAdvanced).toBe(false);
    expect(waitAdvanced).toBe(false);
});