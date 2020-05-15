import * as bp from "../src/bid";
import {testScenarios } from './testutils';

test("the log will return an threadsByWait Object", () => {

    function* thread1() {
        yield [bp.request("eventOne"), bp.wait("eventTwo")];
    }

    function* thread2() {
        yield bp.wait("eventTwo");
    }

    testScenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, ({log}) => {
        expect(log?.latestAction.event.name).toEqual('eventOne');
    });
});



// // test: the log will return pending events
// // test: the log will return the last action