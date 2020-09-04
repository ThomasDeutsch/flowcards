import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { flow } from '../src/scenario'
import { delay } from './testutils';

test("A promise can be requested and will create a pending-event", () => {
    const thread1 = flow({name: 'requestingThread', key: 1}, function* () {
        yield bp.request("A", delay(100));
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        if(event('A').isPending) {
            expect(event('A').isPending).toBeTruthy();
            expect(event('A').value).toBeUndefined();
            expect(event('A').history).toBeUndefined();
            expect(event('A').explain().pending?.threadId.name).toEqual('requestingThread');
        }
    });
});

test("A promise with a key and a promise without a key can be pending at the same time, even if the event-name is the same", (done) => {
    let value1: number, value2: number;
    const thread1 = flow({name: 'requestingThreadOne'}, function* () {
        value1 = yield bp.request("A", delay(100, 55));
    });
    const thread2 = flow({name: 'requestingThreadTwo'}, function* () {
        value2 = yield bp.request({name: "A", key: 1}, delay(100, 66));
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event, thread, actionLog}) => {
        if(event('A').isPending && event('A', 1).isPending) {
            expect(event('A').explain().pending?.threadId.name).toEqual('requestingThreadOne');
            expect(event('A', 1).explain().pending?.threadId.name).toEqual('requestingThreadTwo');
        } else if(thread['requestingThreadOne'].isCompleted && thread['requestingThreadTwo'].isCompleted) {
            expect(value1).toBe(55);
            expect(value2).toBe(66);
            expect(actionLog.length).toEqual(4); // 2x request, 2x resolve
            done();
        }
    });
});

test("A promise-function can be requested and will create a pending-event", () => {
    const thread1 = flow({name: 'thread1'}, function* () {
        yield bp.request("A", () => delay(100));
    });

    testScenarios((enable) => {
        enable(thread1());
    }, (({event}) => {
        const isAPending = event('A').isPending;
        if(isAPending) {
            expect(isAPending).toBeTruthy();
            expect(event('A').dispatch).toBeUndefined();
        }
    }));
});


test("multiple async-requests can be run sequentially", (done) => {
    let threadResetCounter = -1;
    const flow1 = flow(
        {
          name: "flow1",
          title: "card validation scenario"
        },
        function*() {
            threadResetCounter++;
            yield bp.request("WaitForCard", () => delay(100));
            yield bp.request("ValidateCard", () => delay(100));
            yield bp.request("LoadAccount", () => delay(100));
            yield bp.request("WaitForPin", () => delay(100));
        }
    );

    testScenarios((enable) => {
        enable(flow1());
    }, (({thread}) => {
        if(thread['flow1'].isCompleted) {
            expect(threadResetCounter).toEqual(0);
            done();
        }
    }));
});


test("if multiple promises resolve at the same time, only one is selected", (done) => {
    let threadState: any = null;
    let progressed2 = false;
    let progressed3 = false;
    
    const thread1 = flow({name: 'requestingThread'}, function* () {
        yield [bp.request("HeyA", () => delay(1000)), bp.request("HeyB", () => delay(1000))];
    });

    const thread2 = flow(null, function* () {
        yield bp.wait('HeyA');
        progressed2 = true;
    });

    const thread3 = flow(null, function* () {
        yield bp.wait('HeyB');
        progressed3 = true;
    });

    testScenarios((enable) => {
        threadState = enable(thread1());
        enable(thread2());
        enable(thread3());
    }, ({thread}) => {
        if(thread['requestingThread'].isCompleted) {
            expect(progressed2).not.toBe(progressed3);
            done();
        }
    });
});


// TODO: if a thread holds a pending event, but gets disabled or destroyed, the pending event will not be part in the event selection.
// TODO: if a thread resolves a pending event, but is disabled -> the dispatch will be paused or a new option is needed:  "clearPendingOnDisable"
// TODO: if an event is pending, the same thread can block other events.
//      example:   yield [request('async', () => delay(100)), this.isPending('A') ? block('otherEvent')];