import * as bp from "../src/index";
import { testScenarios } from './testutils';
import { BTContext } from '../src/index';
import { flow } from '../src/scenario';


test("the cache function will return the history and the current value", () => {
    let cachedVal: any;
    
    const thread1 = flow(null, function* () {
        yield bp.set('A', 'first');
        yield bp.set('A', 'second');
        yield bp.request('fin');
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        expect(event('A')?.history.length).toEqual(2);
        expect(event('A')?.value).toEqual('second');
    });
});