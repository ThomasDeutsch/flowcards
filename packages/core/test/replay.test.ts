import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { ActionType } from '../src/action';
import { flow } from '../src/scenario';
import { GET_VALUE_FROM_BTHREAD } from '../src/action-log';

test("a thread can be replayed", (done) => {
    let value1: number, value2: number;
    const thread1 = flow({name: 'thread1'}, function* () {
        yield bp.wait('HEY');
        value1 = yield bp.request("A", () => delay(100, 1));
        value2 = yield bp.wait("B");
    });
    const [context, replay] = testScenarios((enable) => {
        enable(thread1());
    }, ({thread}) => {
        if(thread.get('thread1')?.isCompleted) {
            expect(value1).toEqual(1);
            expect(value2).toEqual(3);
            done();
        }
    });
    replay([
        {id: 0, type: ActionType.ui, bThreadId: {name: ''}, event: {name: 'HEY'}},
        {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, event: {name: 'A'}, payload: GET_VALUE_FROM_BTHREAD},
        {id: 2, type: ActionType.resolved, bThreadId: {name: 'thread1'}, event: {name: 'A'}, payload: 1},
        {id: 3, type: ActionType.ui, bThreadId: {name: 'thread1'}, event: {name: 'B'}, payload: 3}])
});

test("if a request-replay has no payload, the original payload will be used", (done) => {
    let value1: number;
    const thread1 = flow({name: 'thread1'}, function* () {
        yield bp.wait('replayEvent1');
        value1 = yield bp.request("replayEvent2", 5);
    });
    const [context, replay] = testScenarios((enable) => {
        enable(thread1());
    }, ({thread}) => {
        if(thread.get('thread1')?.isCompleted) {
            expect(value1).toEqual(5);
            done();
        }
    });
    replay([
        {id: 0, type: ActionType.ui, bThreadId: {name: ''}, event: {name: 'replayEvent1'}},
        {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, event: {name: 'replayEvent2'}, payload: GET_VALUE_FROM_BTHREAD}])
});


test("a async request can be replayed", (done) => {
    let value1: number;
    let eventReplayed = false;
    const thread1 = flow({name: 'thread1'}, function* () {
        yield bp.wait('replayEvent1');
        value1 = yield bp.request("replayEvent2", () => {
            eventReplayed = true;
            return delay(100, 'YEAH');
        });
        yield bp.wait('replayEvent3');
    });
    const [context, replay] = testScenarios((enable) => {
        enable(thread1());
    }, ({thread}) => {
        if(thread.get('thread1')?.isCompleted) {
            expect(value1).toEqual('YEAH');
            expect(eventReplayed).toBeTruthy();
            done();
        }
    });
    replay([
        {id: 0, type: ActionType.ui, bThreadId: {name: ''}, event: {name: 'replayEvent1'}},
        {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, event: {name: 'replayEvent2'}, resolveLoopIndex: 2, payload: GET_VALUE_FROM_BTHREAD},
        // the index:2 action is missing ... this is where the resolve will be placed.
        {id: 3, type: ActionType.ui, bThreadId: {name: ''}, event: {name: 'replayEvent3'}}])
});


test("after a replay completes, the normal execution will resume", (done) => {
    let value1: number;
    const thread1 = flow({name: 'thread1'}, function* () {
        yield bp.wait('replayEvent1');
        yield bp.request('requestEvent1');
        yield bp.request('requestEvent2');
    });
    const [context, replay] = testScenarios((enable) => {
        enable(thread1());
    }, ({thread}) => {
        if(thread.get('thread1')?.isCompleted) {
            expect(true).toEqual(true);
            done();
        }
    });
    replay([
        {id: 0, type: ActionType.ui, bThreadId: {name: ''}, event: {name: 'replayEvent1'}},
        {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, event: {name: 'requestEvent1'}}])
});