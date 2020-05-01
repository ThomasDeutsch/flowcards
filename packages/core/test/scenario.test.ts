/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios } from './testutils';
import { StagingFunction, Action, createUpdateLoop, BTContext } from '../src/index';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test("scenarios can be used without updateCb and logger", done => {
    function* thread1(this: BTContext) {
        yield bp.request("A", delay(1000));
        this.setState(1)
        expect(1).toEqual(1); // simple test if this point is reached.
        done();
    }

    scenarios((enable) => {
        enable(thread1);
    });
});

test("there will be a dispatch-function every waiting event", () => {

    function* thread1() {
        yield [bp.wait("eventOne"), bp.wait("eventTwo")];
    }

    function* thread2() {
        yield bp.wait("eventThree");
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, (scenario) => {
        expect(scenario.dispatch('eventOne')).toBeDefined();
        expect(scenario.dispatch('eventTwo')).toBeDefined();
        expect(scenario.dispatch('eventThree')).toBeDefined();
    });
});


function loggerScenarios(stagingFunction: StagingFunction, da: Set<string>): void {
    const [updateLoop] = createUpdateLoop(stagingFunction, (a: Action): void => {
        if(a.payload) da.add(a.payload.event.name);
        updateLoop(a);   
    });
    updateLoop();
}

test("if a request is cancelled, it will not trigger the same event-name after resolving - even if there are threads waiting for this event. ", done => {
    const dispatchedActions = new Set<string>();
    
    function* thread1() {
        yield bp.request("cancel", delay(100));
    }
    function* thread2(): any {
        let [type] = yield [bp.request('async-event', () => delay(500)), bp.wait('cancel')];
        expect(type.name).toEqual('cancel');
        [type] = yield [bp.wait('async-event'), bp.request("async-event-two", () => delay(1000))];
        expect(type.name).toEqual('async-event-two');
        done();
    }
    loggerScenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, dispatchedActions);
});