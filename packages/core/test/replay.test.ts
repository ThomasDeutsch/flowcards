import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { ActionType, Action } from '../src/action';
import { flow } from '../src/flow';
import { FCEvent, scenarios } from '../src/index';

test("replay actions of type requested can provide a payload. It will be used instead of the actual request value", () => {
    let value1: number, value2: number;

    const thread1 = flow({id: 'thread1'}, function* () {
        value1 = yield bp.request("A", () => delay(100, 1));
        value2 = yield bp.request("B", 2);
        bp.wait('fin');
    });

    const [a, b, startReplay] = testScenarios((enable) => {
        enable(thread1());
    }, ({dispatch}) => {
        if(dispatch('fin')) {
            expect(value1).toEqual(1)
            expect(value2).toEqual(3);
        }
    });
    startReplay([
        {index: 0, type: ActionType.requested, threadId: 'thread1', event: {name: 'A'}},
        {index: 1, type: ActionType.requested, threadId: 'thread1', event: {name: 'B'}, payload: 3}])
});