import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { ActionType, Action } from '../src/action';
import { flow } from '../src/flow';
import { FCEvent, scenarios } from '../src/index';

test("replay actions of type requested can provide a payload. It will be used instead of the actual request value", (done) => {
    let value1: number, value2: number;

    const thread1 = flow({id: 'thread1'}, function* () {
        value1 = yield bp.request("A", delay(100, 1));
        console.log('TETS1!')
        value2 = yield bp.wait("B");
        console.log('TEST2')
        bp.wait('fin');
    });

    const [a, b, startReplay] = testScenarios((enable) => {
        enable(thread1());
    }, ({dispatch}) => {
        console.log('dispatchFin: ', dispatch('fin'))
        if(dispatch('fin')) {
            console.log('values: ', value1, value2);
            expect(value1).toEqual(1)
            expect(value2).toEqual(3);
            done();
        }
    });
    startReplay([
        {index: 0, type: ActionType.requested, threadId: 'thread1', event: {name: 'A'}},
        {index: 1, type: ActionType.resolved, threadId: 'thread1', event: {name: 'A'}, payload: 2},
        {index: 2, type: ActionType.dispatched, threadId: 'thread1', event: {name: 'B'}, payload: 3}])
});