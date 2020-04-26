
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios} from "../src/index";
import { ActionType } from '../src/action';

test("an array of actions can be used as a replay", done => {
    let x = 0;
    function* thread1() {
        yield bp.wait("A");
        yield bp.wait("B");
        yield bp.wait("C");
        done();
    }

    scenarios((enable) => {
        enable(thread1);
    }, ({dispatchReplay, log}) => {
        if(x === 0) {
            x = 1;
            dispatchReplay([
                {
                    type: ActionType.requested,
                    event: {name: 'A'},
                    threadId: ""
                },
                {
                    type: ActionType.requested,
                    event: {name: 'B'},
                    threadId: ""
                },
                {
                    type: ActionType.requested,
                    event: {name: 'C'},
                    threadId: ""
                }
            ]);
        } else {
            expect(log.latestAction.event.name).toBe("C");
            expect(log.latestReactionByThreadId).toHaveProperty("thread1");
        }

    });

});
