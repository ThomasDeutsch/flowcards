import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { ActionType } from '../src/action';
import { flow } from '../src/flow';

test("replay actions of type requested can provide a payload. It will be used instead of the actual request value", (done) => {
    let value1: number, value2: number;
    let x = 0;

    const thread1 = flow({id: 'thread1'}, function* () {
        yield bp.wait('HEY');
        value1 = yield bp.request("A", () => delay(100, 1));
        value2 = yield bp.wait("B");
        yield bp.wait('fin');
    });

    const [context, dispatch, replay] = testScenarios((enable) => {
        enable(thread1());
    }, ({dispatch, log, bThreadState}) => {
        if(dispatch('fin')) {
            expect(value1).toEqual(1);
            expect(value2).toEqual(3);
            done();
        }
    });
    if(x === 0) {
        x++;
        replay([
            {index: 0, type: ActionType.dispatched, threadId: '', event: {name: 'HEY'}},
            {index: 1, type: ActionType.requested, threadId: 'thread1', event: {name: 'A'}},
            {index: 2, type: ActionType.resolved, threadId: 'thread1', event: {name: 'A'}, payload: 1},
            {index: 3, type: ActionType.dispatched, threadId: 'thread1', event: {name: 'B'}, payload: 3}])
    }

});