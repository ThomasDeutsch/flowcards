/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from '../src/index';

test("the log will return an threadsByWait Object", () => {

    function* thread1() {
        yield [bp.request("eventOne"), bp.wait("eventTwo")];
    }

    function* thread2() {
        yield bp.wait("eventTwo");
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, ({log}) => {
        expect(log.latestAction.eventId).toEqual('eventOne');
    });
});

// test: the log will return pending events
// test: the log will return the last action