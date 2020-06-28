import * as bp from "../src/bid";
import { testScenarios } from './testutils';
import { StagingFunction, Action, createUpdateLoop, BTContext } from '../src/index';
import { flow } from '../src/flow';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test("testScenarios can be used without updateCb and logger", done => {
    const thread1 = flow(null, function* (this: BTContext) {
        yield bp.request("A", delay(1000));
        expect(1).toEqual(1); // simple test if this point is reached.
        done();
    })

    testScenarios((enable) => {
        enable(thread1([]));
    });
});

test("there will be a dispatch-function every waiting event", () => {

    const thread1 = flow(null, function* () {
        yield [bp.wait("eventOne"), bp.wait("eventTwo")];
    })

    const thread2 = flow(null, function* () {
        yield bp.wait("eventThree");
    })

    testScenarios((enable) => {
        enable(thread1([]));
        enable(thread2([]));
    }, (scenario) => {
        expect(scenario.dispatch('eventOne')).toBeDefined();
        expect(scenario.dispatch('eventTwo')).toBeDefined();
        expect(scenario.dispatch('eventThree')).toBeDefined();
    });
});


function loggerScenarios(stagingFunction: StagingFunction, da: Set<string>): void {
    const actionQueue: Action[] = [];
    const [updateLoop] = createUpdateLoop(stagingFunction, (a: Action): void => {
        if(a) {
            if(a.payload) da.add(a.payload.event.name);
            actionQueue.push(a);
        }
        
        updateLoop(actionQueue);   
    });
    updateLoop();
}

test("if a request is cancelled, it will not trigger the same event-name after resolving - even if there are threads waiting for this event. ", done => {
    const dispatchedActions = new Set<string>();
    
    const thread1 = flow(null, function* () {
        yield bp.request("cancel", delay(100));
    });

    const thread2 = flow(null, function* (): any {
        let [type] = yield [bp.request('async-event', () => delay(500)), bp.wait('cancel')];
        expect(type.name).toEqual('cancel');
        [type] = yield [bp.wait('async-event'), bp.request("async-event-two", () => delay(1000))];
        expect(type.name).toEqual('async-event-two');
        done();
    });
    
    loggerScenarios((enable) => {
        enable(thread1([]));
        enable(thread2([]));
    }, dispatchedActions);
});