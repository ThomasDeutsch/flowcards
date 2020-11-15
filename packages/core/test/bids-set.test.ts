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
        yield bp.set("testeventA", delay(100, 'resolved value'));
        yield bp.askFor('fin');
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        if(event('fin').dispatch) {
            expect(event('testeventA')?.value).toEqual("resolved value");
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
    }, ({event}) => {
        expect(event("count")?.value).toEqual(2);
    });
});


test("sets can be extended", () => {

    const thread = flow(null, function* () {
        yield bp.set("count", 2);
        yield bp.askFor('fin');
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


test("the cache function will return the history and the current value", () => {
   
    const thread1 = flow(null, function* () {
        yield bp.set('A', 'first');
        yield bp.set('A', 'second');
        yield bp.request('fin');
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        expect(event('A')?.history?.length).toEqual(2);
        expect(event('A')?.value).toEqual('second');
    });
});


test("an event cache for an event will contain keyed values as well", () => {
    const thread1 = flow(null, function* () {
        yield bp.set({name: 'A', key: "1"}, 'a value for 1');
    });

    const thread2 = flow(null, function* () {
        yield bp.set({name: 'A', key: 2}, 'a value for 2');
    })

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event})=> {
        expect(event({name: 'A', key: '1'})?.value).toEqual('a value for 1');
        expect(event({name: 'A', key: 2})?.value).toEqual('a value for 2');
    });
});


test("if an event cache has keyed values, they will not be replaced by a request without key", () => {
    const thread1 = flow(null, function* () {
        yield bp.set({name: 'A', key: "1"}, 'a value for 1');
    });

    const thread2 = flow(null, function* () {
        yield bp.askFor({name: 'A', key: "1"});
        yield bp.set({name: 'A', key: 2}, 'a value for 2');
        yield bp.set('A', 'replacement value')
    })

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event})=> {
        expect(event({name: 'A', key: '1'})?.value).toEqual('a value for 1');
        expect(event({name: 'A', key: 2})?.value).toEqual('a value for 2');
    });
});