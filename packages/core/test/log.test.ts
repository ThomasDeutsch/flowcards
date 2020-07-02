import * as bp from "../src/bid";
import { testScenarios } from './testutils';
import { flow } from '../src/flow';

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

// // test: the log will return the last action