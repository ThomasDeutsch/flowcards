  
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
        yield bp.askFor("A", (pl) => pl !== 1000);
        waitBAdvanced = true;
    })

    const threadC = flow(null, function* () {
        yield bp.askFor("A", (pl) => pl === 1000);
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
        yield bp.askFor("A", (pl) => pl === 1000);
        waitAdvanced = true;
    });

    const threadC = flow(null, function* () {
        yield bp.extend("A", (pl) => pl !== 1000);
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


test("a block can be guarded", (done) => {
    const requestingThread = flow(null, function* () {
        let i = 0;
        while(i++ < 20) {
            const val = yield [bp.request("A", 1000), bp.request("A", 2000)];
            expect(val[1]).toEqual(2000);
            done();
        }
    });

    const blockingThread = flow(null, function* () {
        yield bp.block("A", (pl) => pl === 1000);
    })

    testScenarios((enable) => {
        enable(requestingThread());
        enable(blockingThread());
    })
});


test("a block-guard will be combined with other guards", (done) => {

    const blockingThread = flow(null, function* () {
        yield bp.block("A", (pl: number) => pl < 1500);
    });

    const waitingThread = flow(null, function* () {
        yield bp.askFor("A", (pl) => pl > 1000);
    });

    testScenarios((enable) => {
        enable(blockingThread());
        enable(waitingThread());
    }, ({event}) => {
        if(event('A').dispatch) {
            expect(event('A').dispatch).toBeDefined();
            const wasDispatched = event('A').dispatch?.(1300);
            expect(wasDispatched).toBeFalsy();
            done();
        }
    });
});


test("a block-guard can be keyed", (done) => {

    const blockingThread = flow(null, function* () {
        yield bp.block({name: 'A', key: 2}, (pl) => pl < 1500);
    })

    const waitingThread = flow(null, function* () {
        yield bp.askFor({name: 'A', key: 2}, (pl) => pl > 1000);
    })

    testScenarios((enable) => {
        enable(blockingThread());
        enable(waitingThread());
    }, ({event}) => {
        if(event({name: 'A', key: 2})?.dispatch) {
            expect(event({name: 'A', key: 2}).validate(2000).isValid).toBe(true);
            expect(event({name: 'A', key: 2}).validate(1000).isValid).toBe(false);
            done();
        }
    });
});