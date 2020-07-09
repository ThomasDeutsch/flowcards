import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { ActionType } from '../src/action';
import { flow } from '../src/flow'


function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


test("A promise can be requested and will create a pending-event", () => {
    const thread1 = flow({id: 'thread1'}, function* () {
        yield bp.request("A", delay(100));
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({log, isPending}) => {
        expect(isPending('A')).toBeTruthy();
        expect(log?.latestAction.event).toEqual({name: 'A'});
        expect(log?.latestAction.threadId).toBe("thread1");
        expect(log?.latestAction.type).toBe(ActionType.promise);
    });
});


test("A promise-function can be requested and will create a pending-event", () => {
    const thread1 = flow({id: 'thread1'}, function* () {
        yield bp.request("A", () => delay(100));
    });

    testScenarios((enable) => {
        enable(thread1());
    }, (({log, isPending}) => {
        expect(isPending('A')).toBeTruthy();
        expect(log?.latestAction.event).toEqual({name: 'A'});
        expect(log?.latestAction.threadId).toBe("thread1");
        expect(log?.latestAction.type).toBe(ActionType.promise);
    }));
});


test("if multiple promises resolve at the same time, only one is selected", (done) => {
    let threadState: any = null;
    let progressed2 = false;
    let progressed3 = false;
    
    const thread1 = flow(null, function* () {
        yield [bp.request("HeyA", () => delay(1000)), bp.request("HeyB", () => delay(1000))];
        yield bp.wait('fin');
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
    }, ({dispatch}) => {
        if(dispatch('fin')) {
            expect(progressed2).not.toBe(progressed3);
            done();
        }
    });
});