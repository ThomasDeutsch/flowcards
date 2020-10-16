import * as bp from "../src/index";
import { testScenarios, delay } from "./testutils";
import { flow } from '../src/scenario';

test("a set is a request, that will be cached. ", () => {
    const thread1 = flow(null, function* () {
        yield bp.set("count", 2);
    })


    testScenarios((enable, ) => {
        enable(thread1());
    }, ({event}) => {
        expect(event("count")?.value).toEqual(2);
    });
});

test("when a promise resolves, the cache gets updated", (done) => {
    const thread1 = flow(null, function* () {
        yield bp.set("testEvent", delay(100, 'resolved value'));
        yield bp.wait('fin');
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        if(event('fin').dispatch) {
            expect(event('testEvent')?.value).toEqual("resolved value");
            done();
        }
    });
});


test("if there are multiple sets at the same time, one will be requested first (the higher priority one).", () => {

    const threadLow = flow(null, function* () {
        yield bp.set("count", 2);
    });

    const threadHigh = flow(null, function* () {
        yield bp.set("count", 1000);
    });

    testScenarios((enable) => {
        enable(threadLow());
        enable(threadHigh());
    }, ({event, log}) => {
        console.log('TEST: ', log.actions);
        
        expect(event("count")?.value).toEqual(2);
    });
});


test("sets can be extended", () => {

    const thread = flow(null, function* () {
        yield bp.set("count", 2);
        yield bp.wait('fin');
    });

    const thread2 = flow(null, function* () {
        const extend = yield bp.extend("count");
        extend.resolve(extend.value + 2);
    });

    testScenarios((enable) => {
        enable(thread());
        enable(thread2());
    }, ({event}) => {
        if(event('fin').dispatch) {
            expect(event('count')?.value).toEqual(4);

        }
    });
});


