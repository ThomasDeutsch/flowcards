import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { ActionType } from '../src/action';


function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


test("A promise can be requested and will create a pending-event", () => {
    function* thread1() {
        yield bp.request("A", delay(100));
    }
    testScenarios((enable) => {
        enable(thread1);
    }, ({log}) => {
        expect(log?.currentPendingEvents.has({name: 'A'})).toBeTruthy();
        expect(log?.latestAction.event).toEqual({name: 'A'});
        expect(log?.latestAction.threadId).toBe("thread1");
        expect(log?.latestAction.type).toBe(ActionType.requested);
    });
});


test("A promise-function can be requested and will create a pending-event", () => {
    function* thread1() {
        yield bp.request("A", () => delay(100));
    }
    testScenarios((enable) => {
        enable(thread1);
    }, (({log}) => {
        expect(log?.currentPendingEvents.has({name: 'A'})).toBeTruthy();
        expect(log?.latestAction.event).toEqual({name: 'A'});
        expect(log?.latestAction.threadId).toBe("thread1");
        expect(log?.latestAction.type).toBe(ActionType.requested);
    }));
});


test("if multiple promises resolve at the same time, only one is selected", (done) => {
    let threadState: any = null;
    let progressed2 = false;
    let progressed3 = false;
    
    function* thread1() {
        yield [bp.request("HeyA", () => delay(1000)), bp.request("HeyB", () => delay(1000))];
        yield bp.wait('fin');
    }

    function* thread2() {
        yield bp.wait('HeyA');
        progressed2 = true;
    }

    function* thread3() {
        yield bp.wait('HeyB');
        progressed3 = true;
    }

    testScenarios((enable) => {
        threadState = enable(thread1);
        enable(thread2);
        enable(thread3);
    }, ({dispatch}) => {
        if(dispatch('fin')) {
            expect(progressed2).not.toBe(progressed3);
            done();
        }
    });
});