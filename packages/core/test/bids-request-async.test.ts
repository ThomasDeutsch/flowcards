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


test("multiple promises can be requested and all will create a corresponding pending-event", () => {
    let threadState: any = null;
    
    function* thread1() {
        yield [bp.request("HeyA", () => delay(1000)), bp.request("HeyB", () => delay(1000))];
    }

    testScenarios((enable) => {
        threadState = enable(thread1);
    }, ({log}) => {
        expect(log?.currentPendingEvents.has({name: 'HeyA'})).toEqual(true);
        expect(log?.currentPendingEvents.has({name: 'HeyB'})).toEqual(true);
    });
});