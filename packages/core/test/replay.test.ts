
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { Logger, scenarios} from "../src/index";
import { ActionType } from '../src/action';

test("an array of actions can be used as a replay", done => {
    let x = 0;
    function* thread1() {
        yield bp.wait("A");
        yield bp.wait("B");
        yield bp.wait("C");
        done();
    }
    const logger = new Logger();
    scenarios((enable) => {
        enable(thread1);
    }, ({replay}) => {
        if(x === 0) {
            x = 1;
            replay([
                {
                    type: ActionType.request,
                    eventName: 'A'
                },
                {
                    type: ActionType.request,
                    eventName: 'B'
                },
                {
                    type: ActionType.request,
                    eventName: 'C'
                }
            ]);
        }
    }, logger);
    expect(logger.getLatestReactions().threadIds).toContain("thread1");
    expect(logger.getLatestAction().eventName).toEqual("C");
});
