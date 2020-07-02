import * as bp from "../src/index";
import { testScenarios, delay } from "./testutils";
import { flow } from '../src/flow';

test("a set is a request, that will be cached. ", () => {
    const thread1 = flow(null, function* () {
        yield bp.set("count", 2);
    })

    testScenarios((enable, ) => {
        enable(thread1([]));
    }, ({event}) => {
        expect(event.value("count")).toEqual(2);
    });
});

test("when a promise resolves, the cache gets updated", (done) => {

    const thread1 = flow(null, function* () {
        yield bp.set("testevent", delay(100, 'resolved value'));
        yield bp.wait('fin');
    });

    testScenarios((enable) => {
        enable(thread1([]));
    }, ({dispatch, event}) => {
        if(dispatch('fin')) {
            expect(event.value('testevent')).toEqual("resolved value");
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
        enable(threadLow([]));
        enable(threadHigh([]));
    }, ({event}) => {
        expect(event.value("count")).toEqual(2);
    });
});

test("sets can be extended", () => {

    const thread = flow(null, function* () {
        yield bp.set("count", 2);
    });

    const thread2 = flow(null, function* () {
        yield bp.extend("count", undefined, (val: number) => val + 2);
    });

    testScenarios((enable) => {
        enable(thread([]));
        enable(thread2([]));
    }, ({event}) => {
        expect(event.value('count')).toEqual(4);
    });
});


