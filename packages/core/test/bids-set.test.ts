import * as bp from "../src/index";
import { testScenarios, delay } from "./testutils";
import { scenario } from '../src/scenario';

test("a set is a request, that will be cached. ", () => {
    const thread1 = scenario(null, function* () {
        yield bp.set("count", 2);
    })

    testScenarios((enable, event) => {
        enable(thread1());
    }, ({event}) => {
        expect(event("count").value).toEqual(2);
    });
});


test("an array can be set", () => {
    const thread1 = scenario(null, function* () {
        yield bp.set("count", [2]);
    })


    testScenarios((enable, ) => {
        enable(thread1());
    }, ({event}) => {
        expect(Array.isArray(event("count").value)).toBeTruthy();
    });
});


test("when a promise resolves, the cache gets updated", (done) => {
    const thread1 = scenario({id: 't1'}, function* () {
        const x = yield bp.set("EVENTXXS", () => delay(100, 'resolved value'));
        yield bp.askFor('fin11');
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event}) => {
        if(event('fin11').dispatch) {
            expect(event('EVENTXXS')?.value).toEqual("resolved value");
            done();
        }
    });
});


test("if there are multiple sets at the same time, one will be requested first (the higher priority one).", () => {

    const threadLow = scenario(null, function* () {
        yield bp.set("count", 2);
    });

    const threadHigh = scenario(null, function* () {
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

    const thread = scenario(null, function* () {
        yield bp.set("count", 2);
        yield bp.askFor('fin');
    });

    const thread2 = scenario(null, function* () {
        const extend = yield bp.extend("count");
        extend.resolve?.(extend.payload + 2);
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

    const thread1 = scenario(null, function* () {
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
    const thread1 = scenario(null, function* () {
        yield bp.set({name: 'A', key: "1"}, 'a value for 1');
    });

    const thread2 = scenario(null, function* () {
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
    const thread1 = scenario(null, function* () {
        yield bp.set({name: 'A', key: "1"}, 'a value for 1');
    });

    const thread2 = scenario(null, function* () {
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


test("a resolved set will update the value", (done) => {
    const thread1 = scenario({id: 't1'}, function* () {
        yield bp.set("A", "FIRST...");
        yield bp.request('C', delay(10, 'x'))
        yield bp.set("A", delay(200, "...SECOND"));
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({event, scenario})=> {
        if(scenario('t1')!.isCompleted) {
            expect(event('A')?.value).toEqual('...SECOND');
            done();
        }
    });
});
