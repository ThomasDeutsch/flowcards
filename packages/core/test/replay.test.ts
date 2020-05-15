import * as bp from "../src/bid";
import { testScenarios} from "./testutils";
import { ActionType } from '../src/action';

test("an array of actions can be used as a replay", done => {
    let x = 0;
    function* thread1() {
        yield bp.wait("A");
        yield bp.wait("B");
        yield bp.wait("C");
        done();
    }

    testScenarios((enable) => {
        enable(thread1);
    }, ({dispatch, log}) => {
        if(x === 0) {
            x = 1;
            dispatch('___REPLAY___', [
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
            expect(log?.latestAction.event.name).toBe("C");
            expect(log?.latestReactionByThreadId).toHaveProperty("thread1");
        }

    });

});
