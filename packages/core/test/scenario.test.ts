import * as bp from "../src/bid";
import { testScenarios } from './testutils';
import { BThreadContext } from '../src/index';
import { scenario } from '../src/scenario';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test("testScenarios can be used without updateCb and logger", done => {
    const thread1 = scenario(null, function* (this: BThreadContext) {
        yield bp.request("A", delay(10));
        expect(1).toEqual(1); // simple test if this point is reached.
        done();
    })

    testScenarios((enable) => {
        enable(thread1());
    });
});


test("pending will show what events are pending", (done) => {
    const thread1 = scenario(null, function* () {
        yield bp.request("count", () => delay(2000));
    });

    testScenarios((enable, cache) => {
        cache({name: 'count'});
        enable(thread1());
    }, ({event}) => {
        if(event('count').isPending) {
            expect(event("count")).toBeDefined();
            done();
        }
    });
});

test("the bThreadState is returned by the scenarios function", () => {

    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.request("eventOne");
    });
  
    const thread2 = scenario({id: 'thread2'}, function* ({prop1: number, prop2: string}) {
        yield bp.askFor("eventTwo");
    })
  
    testScenarios((enable) => {
        enable(thread1());
        enable(thread2({prop1: 912, prop2: 'test'}));
    }, ({scenario}) => {
        expect(scenario.get('thread1')?.isCompleted).toBeTruthy();
        expect(scenario.get('thread2')?.isCompleted).toBeFalsy();
    });
  });

  test("the bThreadState contains an orderIndex, the first enabled BThread will have an index of 0", () => {

    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.request("eventOne");
    });
  
    const thread2 = scenario({id: 'thread2'}, function* () {
        yield bp.askFor("eventTwo");
    })
  
    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({scenario}) => {
        expect(scenario.get('thread1')?.orderIndex).toBe(0);
        expect(scenario.get('thread2')?.orderIndex).toBe(1);
    });
  });