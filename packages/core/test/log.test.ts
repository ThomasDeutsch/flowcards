import * as bp from "../src/bid";
import { testScenarios } from './testutils';
import { flow } from '../src/flow';
import { ReactionType } from "../src";

test("the log will return an latestAction Object", () => {

    const thread1 = flow(null, function* () {
        yield [bp.request("eventOne"), bp.wait("eventTwo")];
    });

    const thread2 = flow(null, function* () {
        yield bp.wait("eventTwo");
    })

    testScenarios((enable) => {
        enable(thread1([]));
        enable(thread2([]));
    }, ({log}) => {
        expect(log?.latestAction.event.name).toEqual('eventOne');
    });
});

test("the log will have a Record of all active threads", () => {

    const thread1 = flow({id: 'thread1', title: 'myThread1'}, function* () {
        yield [bp.request("eventOne"), bp.wait("eventTwo")];
    });

    const thread2 = flow({id: 'thread2', title: 'myThread2'}, function* () {
        yield bp.wait("eventTwo");
    })

    testScenarios((enable) => {
        enable(thread1([]));
        enable(thread2([]));
    }, ({log}) => {
        expect(log?.threadInfoById.thread1.title).toEqual('myThread1');
        expect(log?.threadInfoById.thread2.title).toEqual('myThread2');
    });
});


function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

test("the log will have an EventMap of all pending events", () => {

    const requestingThread = flow({id: 'thread1', title: 'myThread1'}, function* () {
        yield bp.request("eventOne", delay(1000));
    });

    testScenarios((enable) => {
        enable(requestingThread([]));
    }, ({log}) => {
        expect(log?.currentPendingEvents.has({name: 'eventOne'}));
    });
});


test("the log will have an EventMap of all current waits", () => {

    const requestingThread = flow({id: 'thread1', title: 'myThread1'}, function* () {
        yield [bp.wait("waitEvent1"), bp.wait('waitEvent2')];
    });

    testScenarios((enable) => {
        enable(requestingThread([]));
    }, ({log}) => {
        expect(log?.currentWaits.has({name: 'waitEvent1'}));
        expect(log?.currentWaits.has({name: 'waitEvent2'}));
    });
});


test("the log will return the latest reaction-type of a thread", () => {

    const requestingThread = flow({id: 'thread1', title: 'myThread1'}, function* () {
        yield bp.request("event1");
        yield bp.wait('event2')
    });

    testScenarios((enable) => {
        enable(requestingThread([]));
    }, ({log}) => {
        expect(log?.latestReactionByThreadId['thread1'].type === ReactionType.progress);
        expect(log?.currentWaits.has({name: 'waitEvent2'}));
    });
});


test("the resolve action will contain a duration of the pending request", (done) => {
    const requestingThread = flow({id: 'thread1', title: 'myThread1'}, function* () {
        yield bp.request("event1", () => delay(1200, "hello"));
        yield bp.wait('event2');
    });

    testScenarios((enable) => {
        enable(requestingThread([]));
    }, ({log, dispatch}) => {
        if(dispatch('event2')) {
            expect(log?.latestAction.pendingDuration).toBeGreaterThan(1);
            done();
        }
    });
});


