import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { ActionType, GET_VALUE_FROM_BTHREAD } from '../src/action';
import { flow } from '../src/scenario';
import { BidType } from '../src/bid';

test("a thread can be replayed", (done) => {
    let value1: number, value2: number;
    const thread1 = flow({name: 'thread1'}, function* () {
        yield bp.wait('HEY');
        value1 = yield bp.request("requestingEventA", () => delay(2000, 5));
        expect(value1).toBe(1); // not 5, because the replay-resolve value is 1
        value2 = yield bp.wait("B");
    });
    const [_, replay] = testScenarios((enable) => {
        enable(thread1());
    }, ({thread}) => {
        if(thread.get('thread1')?.isCompleted) {
            expect(value1).toEqual(1);
            expect(value2).toEqual(3);
            done();
        }
    });
    replay([
        {id: 0, type: ActionType.ui, bThreadId: {name: ''}, eventId: {name: 'HEY'}},
        {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'requestingEventA'}, bidType: BidType.request, payload: () => delay(100, 1)},
        {id: 2, type: ActionType.resolved, bThreadId: {name: 'thread1'}, eventId: {name: 'requestingEventA'}, bidType: BidType.request, payload: 1},
        {id: 3, type: ActionType.ui, bThreadId: {name: 'thread1'}, eventId: {name: 'B'}, payload: 3}])
});


test("if a request-replay has a GET_VALUE_FROM_BTHREAD symbol as payload, the b-threads payload will be used", (done) => {
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
        {id: 0, type: ActionType.ui, bThreadId: {name: ''}, eventId: {name: 'replayEvent1'}},
        {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'replayEvent2'}, payload: GET_VALUE_FROM_BTHREAD, bidType: BidType.request}])
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
        {id: 0, type: ActionType.ui, bThreadId: {name: ''}, eventId: {name: 'replayEvent1'}},
        {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'replayEvent2'}, resolveActionId: 2, payload: GET_VALUE_FROM_BTHREAD, bidType: BidType.request},
        // the index:2 action is missing ... this is where the resolve will be placed.
        {id: 3, type: ActionType.ui, bThreadId: {name: ''}, eventId: {name: 'replayEvent3'}}])
});


test("after a replay completes, the normal execution will resume", (done) => {
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
        {id: 0, type: ActionType.ui, bThreadId: {name: ''}, eventId: {name: 'replayEvent1'}},
        {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'requestEvent1'}, bidType: BidType.request}])
});