import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { ActionType, Action } from '../src/action';
import { flow } from '../src/flow';
import { FCEvent, scenarios } from '../src/index';

test("replay actions of type requested can provide a payload. It will be used instead of the actual request value", (done) => {
    let value1: number, value2: number;
    let x = 0;

    const thread1 = flow({id: 'thread1'}, function* () {
        yield bp.wait('HEY');
        console.log('SUPER!!');
        value1 = yield bp.request("A", delay(100, 1));
        console.log('FRESH')
        value2 = yield bp.wait("B");
        console.log('Bonkers')
        bp.wait('fin');
    });

    const [context, dispatch, replay] = testScenarios((enable) => {
        enable(thread1());
    }, ({dispatch, log}) => {
        console.log('DISPATCH FIN?', dispatch('fin'), log?.actions)
        if(dispatch('fin')) {
            console.log('FINISHED: ', value1, value2)
            expect(value1).toEqual(1);
            expect(value2).toEqual(3);
            done();
        }
    });
    if(x === 0) {
        x++;
        replay([
            {index: 0, type: ActionType.dispatched, threadId: '', event: {name: 'HEY'}, payload: 1},
            {index: 1, type: ActionType.requested, threadId: 'thread1', event: {name: 'A'}},
            {index: 2, type: ActionType.resolved, threadId: 'thread1', event: {name: 'A'}},
            {index: 3, type: ActionType.dispatched, threadId: 'thread1', event: {name: 'B'}}])
    }

});