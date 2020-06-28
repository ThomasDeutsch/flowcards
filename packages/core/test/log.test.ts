import * as bp from "../src/bid";
import { testScenarios } from './testutils';
import { flow } from '../src/flow';

test("the log will return an threadsByWait Object", () => {

    const thread1 = flow(null, function* () {
        yield [bp.request("eventOne"), bp.wait("eventTwo")];
    });

    const thread2 = flow(null, function* () {
        yield bp.wait("eventTwo");
    })

    testScenarios((enable) => {
        enable(thread1([]));
        enable(thread2([]));
    }, ({log}) => {
        expect(log?.latestAction.event.name).toEqual('eventOne');
    });
});


// // test: the log will return pending events
// // test: the log will return the last action