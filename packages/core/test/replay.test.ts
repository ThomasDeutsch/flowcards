import * as bp from "../src/bid";
import { testScenarios} from "./testutils";
import { ActionType } from '../src/action';
import { flow } from '../src/flow';

test("an array of actions can be used as a replay", done => {
    let x = 0;
    const thread1 = flow({id: 'thread1'}, function* () {
        yield bp.wait("A");
        yield bp.wait("B");
        yield bp.wait("C");
        done();
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({actionDispatch, log}) => {
        if(x === 0) {
            x = 1;
            actionDispatch({
                type: ActionType.requested,
                event: {name: 'A'},
                threadId: 'thread1',
                isReplay: true
            });
            actionDispatch({
                type: ActionType.requested,
                event: {name: 'B'},
                threadId: 'thread1',
                isReplay: true
            });
            actionDispatch({
                type: ActionType.requested,
                event: {name: 'C'},
                threadId: 'thread1',
                isReplay: true
            });
        } else {
            expect(log?.latestAction.event.name).toBe("C");
        }
    });
});
