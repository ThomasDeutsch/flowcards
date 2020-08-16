import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { ActionType } from '../src/action';
import { flow } from '../src/scenario'
import { delay } from './testutils';


test("A promise can be requested and will create a pending-event", () => {
    const thread1 = flow({id: 'thread1'}, function* () {
        yield bp.request("A", delay(100));
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({log, pending}) => {
        if(pending.has('A')) {
            expect(pending.has('A')).toBeTruthy();
        }
    });
});

test("A promise-function can be requested and will create a pending-event", () => {
    const thread1 = flow({id: 'thread1'}, function* () {
        yield bp.request("A", () => delay(100));
    });

    testScenarios((enable) => {
        enable(thread1());
    }, (({log, pending}) => {
        if(pending.has('A')) {
            expect(pending.has('A')).toBeTruthy();
        }
    }));
});


test("a series of pending events will progress if one promise resolves", (done) => {
    let inits = 0;
    const flow1 = flow(
        {
          id: "flow1",
          title: "card validation scenario"
        },
        function*() {
            inits++;
            yield bp.request("WaitForCard", () => delay(100));
            yield bp.request("ValidateCard", () => delay(100));
            yield bp.request("LoadAccount", () => delay(100));
            yield bp.request("WaitForPin", () => delay(100));
            yield bp.wait('x')
        }
      );

    testScenarios((enable) => {
        enable(flow1());
    }, (({log, pending}) => {
        if(pending.isEmpty()) {
            expect(inits).toEqual(1);
            done();
        }

    }));
});


test("if multiple promises resolve at the same time, only one is selected", (done) => {
    let threadState: any = null;
    let progressed2 = false;
    let progressed3 = false;
    
    const thread1 = flow(null, function* () {
        yield [bp.request("HeyA", () => delay(1000)), bp.request("HeyB", () => delay(1000))];
        yield bp.wait('fin');
    });

    const thread2 = flow(null, function* () {
        yield bp.wait('HeyA');
        progressed2 = true;
    });

    const thread3 = flow(null, function* () {
        yield bp.wait('HeyB');
        progressed3 = true;
    });

    testScenarios((enable) => {
        threadState = enable(thread1());
        enable(thread2());
        enable(thread3());
    }, ({dispatch}) => {
        if(dispatch('fin')) {
            expect(progressed2).not.toBe(progressed3);
            done();
        }
    });
});


// TODO: if a thread holds a pending event, but gets disabled or destroyed, the pending event will not be part in the event selection.
// TODO: if a thread resolves a pending event, but is disabled -> the dispatch will be paused or a new option is needed:  "clearPendingOnDisable"
// TODO: if an event is pending, the same thread can block other events.
//      example:   yield [request('async', () => delay(100)), this.isPending('A') ? block('otherEvent')];