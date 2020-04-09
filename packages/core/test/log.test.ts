/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios, StagingFunction, DispatchedAction, createUpdateLoop } from '../src/index';

test("the log will return an threadsByWait Object", () => {

    function* thread1() {
        yield [bp.wait("eventOne"), bp.wait("eventTwo")];
    }

    function* thread2() {
        yield bp.wait("eventTwo");
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, ({log}) => {
        expect(log.threadsByWait).toHaveProperty('eventOne');
        expect(log.threadsByWait).toHaveProperty('eventTwo');
        expect(log.threadsByWait.eventOne[0]).toEqual('thread1');
        expect(log.threadsByWait.eventTwo.length).toEqual(2);
        expect(log.threadsByWait.eventTwo[0]).toEqual('thread1');
        expect(log.threadsByWait.eventTwo[1]).toEqual('thread2');
    });
});