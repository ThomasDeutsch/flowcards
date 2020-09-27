  
import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { flow } from '../src/scenario';



test("a wait is not advanced, if the guard returns false", () => {
    let requestAdvanced = false;
    let waitBAdvanced = false;
    let waitCAdvanced = false;

    const threadA = flow(null, function* () {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    });

    const threadB = flow(null, function* () {
        yield bp.wait("A", (pl: number) => pl !== 1000);
        waitBAdvanced = true;
    })

    const threadC = flow(null, function* () {
        yield bp.wait("A", (pl: number) => pl === 1000);
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

    const threadA = flow(null, function* () {
        yield bp.request("A", 1000);
        requestAdvanced = true;
    });

    const threadB = flow(null, function* () {
        yield bp.wait("A", (pl: number) => pl === 1000);
        waitAdvanced = true;
    });

    const threadC = flow(null, function* () {
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


test("a block can be guarded", () => {

    const requestingThread = flow(null, function* () {
        let i = 0;
        while(i++ < 20) {
            const [_, val] = yield [bp.request("A", 1000), bp.request("A", 2000)];
            expect(val).toEqual(2000);
        }
    });

    const blockingThread = flow(null, function* () {
        yield bp.block("A", (pl: number) => pl === 1000);
    })

    testScenarios((enable) => {
        enable(requestingThread());
        enable(blockingThread());
    })
});


test("a block-guard will be combined with other guards", () => {

    const blockingThread = flow(null, function* () {
        yield bp.block("A", (pl: number) => pl < 1500);
    });

    const waitingThread = flow(null, function* () {
        yield bp.wait("A", (pl: number) => pl > 1000);
    });

    testScenarios((enable) => {
        enable(blockingThread());
        enable(waitingThread());
    }, ({event}) => {
        if(event('A').dispatch) {
            expect(event('A').dispatch).toBeDefined();
            //expect(event('A').validate(1001).invalid.length).toBe(2);
            const wasDispatched = event('A').dispatch?.(1300);
            expect(wasDispatched).toBeFalsy();
        }
    });
});


test("a block-guard can be keyed", () => {

    const blockingThread = flow(null, function* () {
        yield bp.block({name: 'A', key: 1}, (pl: number) => pl < 1500);
    })

    const waitingThread = flow(null, function* () {
        yield bp.wait({name: 'A', key: 2}, (pl: number) => pl > 1000);
    })

    testScenarios((enable) => {
        enable(blockingThread());
        enable(waitingThread());
    }, ({event}) => {
        if(event('A')?.dispatch) {
            expect(event('A').dispatch).toBeDefined();
            expect(event('A').validate(2000).invalid.length).toBeFalsy();
            expect(event('A').validate(1001).invalid.length).toBeFalsy();
        }
    });
});

// TODO: explain function will return an array of EventInfo